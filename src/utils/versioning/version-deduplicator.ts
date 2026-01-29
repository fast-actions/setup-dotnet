import * as core from '@actions/core';
import type { VersionSet, VersionSetWithPrerelease } from '../../types';
import { getSdkIncludedVersions } from './sdk-runtime-mapper';
import { resolveVersion } from './version-resolver';

// Remove redundant versions based on .NET hierarchy: SDK > ASP.NET Core Runtime > .NET Runtime
export async function deduplicateVersions(
	versions: VersionSetWithPrerelease,
): Promise<VersionSet> {
	// Resolve all wildcards to concrete versions
	const resolvedSdk = versions.sdk.versions.map((v) => ({
		original: v,
		resolved: resolveVersion(v, 'sdk', versions.sdk.allowPrerelease),
	}));

	const resolvedRuntime = versions.runtime.versions.map((v) => ({
		original: v,
		resolved: resolveVersion(v, 'runtime', versions.runtime.allowPrerelease),
	}));

	const resolvedAspnetcore = versions.aspnetcore.versions.map((v) => ({
		original: v,
		resolved: resolveVersion(
			v,
			'aspnetcore',
			versions.aspnetcore.allowPrerelease,
		),
	}));

	// Extract resolved versions as sets for fast lookup
	const sdkSet = new Set(resolvedSdk.map((v) => v.resolved));
	const aspnetcoreSet = new Set(resolvedAspnetcore.map((v) => v.resolved));

	// Get runtime/aspnetcore versions included in SDKs
	const sdkIncludedVersions = await Promise.all(
		resolvedSdk.map(async (sdk) => ({
			sdk: sdk.resolved,
			included: await getSdkIncludedVersions(sdk.resolved),
		})),
	);

	// Build set of runtime versions covered by SDKs
	const sdkIncludedRuntimes = new Set<string>();
	for (const { sdk, included } of sdkIncludedVersions) {
		if (included.runtime) {
			sdkIncludedRuntimes.add(included.runtime);
			core.debug(`SDK ${sdk} includes runtime ${included.runtime}`);
		}
	}

	// Filter runtime: remove if included in SDK, same version in aspnetcore, or same version in sdk
	const filteredRuntime = resolvedRuntime.filter((v) => {
		// Check SDK-included first (most specific)
		if (sdkIncludedRuntimes.has(v.resolved)) {
			core.info(`Skipping redundant Runtime ${v.original} (included in SDK)`);
			return false;
		}
		if (aspnetcoreSet.has(v.resolved) || sdkSet.has(v.resolved)) {
			core.info(
				`Skipping redundant Runtime ${v.original} (covered by ${aspnetcoreSet.has(v.resolved) ? 'ASP.NET Core' : 'SDK'})`,
			);
			return false;
		}
		return true;
	});

	// Filter aspnetcore: remove if included in SDK (check runtime version) or same version in sdk
	const filteredAspnetcore = resolvedAspnetcore.filter((v) => {
		// Check SDK-included runtime first (ASP.NET Core uses same version as runtime)
		if (sdkIncludedRuntimes.has(v.resolved)) {
			core.info(
				`Skipping redundant ASP.NET Core ${v.original} (included in SDK)`,
			);
			return false;
		}
		if (sdkSet.has(v.resolved)) {
			core.info(
				`Skipping redundant ASP.NET Core ${v.original} (covered by SDK)`,
			);
			return false;
		}
		return true;
	});

	// Remove duplicates within same type (e.g., 8.0.23 and 8.0.x both resolve to 8.0.23)
	const uniqueSdk = removeDuplicatesWithinType(resolvedSdk, 'SDK');
	const uniqueRuntime = removeDuplicatesWithinType(filteredRuntime, 'Runtime');
	const uniqueAspnetcore = removeDuplicatesWithinType(
		filteredAspnetcore,
		'ASP.NET Core',
	);

	return {
		sdk: uniqueSdk,
		runtime: uniqueRuntime,
		aspnetcore: uniqueAspnetcore,
	};
}

function removeDuplicatesWithinType(
	versions: Array<{ original: string; resolved: string }>,
	type: string,
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const v of versions) {
		if (seen.has(v.resolved)) {
			core.info(
				`Skipping duplicate ${type} ${v.original} (already resolved to ${v.resolved})`,
			);
			continue;
		}
		seen.add(v.resolved);
		result.push(v.resolved);
	}

	return result;
}
