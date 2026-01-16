import * as core from '@actions/core';
import { getSdkIncludedVersions } from './sdk-runtime-mapper';
import { resolveVersion } from './version-resolver';

export interface VersionSet {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}

/**
 * Remove redundant versions based on .NET hierarchy:
 * SDK > ASP.NET Core Runtime > .NET Runtime
 */
export async function deduplicateVersions(
	versions: VersionSet,
): Promise<VersionSet> {
	// Resolve all wildcards to concrete versions
	const resolvedSdk = await Promise.all(
		versions.sdk.map(async (v) => ({
			original: v,
			resolved: await resolveVersion(v, 'sdk'),
		})),
	);

	const resolvedRuntime = await Promise.all(
		versions.runtime.map(async (v) => ({
			original: v,
			resolved: await resolveVersion(v, 'runtime'),
		})),
	);

	const resolvedAspnetcore = await Promise.all(
		versions.aspnetcore.map(async (v) => ({
			original: v,
			resolved: await resolveVersion(v, 'aspnetcore'),
		})),
	);

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

	// Build sets of versions covered by SDKs
	const sdkIncludedRuntimes = new Set<string>();
	const sdkIncludedAspnetcore = new Set<string>();
	for (const { sdk, included } of sdkIncludedVersions) {
		if (included.runtime) {
			sdkIncludedRuntimes.add(included.runtime);
			core.debug(`SDK ${sdk} includes runtime ${included.runtime}`);
		}
		if (included.aspnetcore) {
			sdkIncludedAspnetcore.add(included.aspnetcore);
			core.debug(`SDK ${sdk} includes aspnetcore ${included.aspnetcore}`);
		}
	}

	// Filter runtime: remove if included in SDK, same version in aspnetcore, or same version in sdk
	const filteredRuntime = resolvedRuntime.filter((v) => {
		// Check SDK-included first (most specific)
		if (sdkIncludedRuntimes.has(v.resolved)) {
			core.info(
				`ℹ️  Skipping redundant runtime ${v.original} (included in SDK)`,
			);
			return false;
		}
		if (aspnetcoreSet.has(v.resolved) || sdkSet.has(v.resolved)) {
			core.info(
				`ℹ️  Skipping redundant runtime ${v.original} (covered by ${aspnetcoreSet.has(v.resolved) ? 'aspnetcore' : 'sdk'})`,
			);
			return false;
		}
		return true;
	});

	// Filter aspnetcore: remove if included in SDK or same version in sdk
	const filteredAspnetcore = resolvedAspnetcore.filter((v) => {
		// Check SDK-included first (most specific)
		if (sdkIncludedAspnetcore.has(v.resolved)) {
			core.info(
				`ℹ️  Skipping redundant aspnetcore ${v.original} (included in SDK)`,
			);
			return false;
		}
		if (sdkSet.has(v.resolved)) {
			core.info(
				`ℹ️  Skipping redundant aspnetcore ${v.original} (covered by sdk)`,
			);
			return false;
		}
		return true;
	});

	// Remove duplicates within same type (e.g., 8.0.23 and 8.0.x both resolve to 8.0.23)
	const uniqueSdk = removeDuplicatesWithinType(resolvedSdk, 'sdk');
	const uniqueRuntime = removeDuplicatesWithinType(filteredRuntime, 'runtime');
	const uniqueAspnetcore = removeDuplicatesWithinType(
		filteredAspnetcore,
		'aspnetcore',
	);

	return {
		sdk: uniqueSdk,
		runtime: uniqueRuntime,
		aspnetcore: uniqueAspnetcore,
	};
}

/**
 * Remove duplicate resolved versions within same type
 */
function removeDuplicatesWithinType(
	versions: Array<{ original: string; resolved: string }>,
	type: string,
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const v of versions) {
		if (seen.has(v.resolved)) {
			core.info(
				`ℹ️  Skipping duplicate ${type} ${v.original} (already resolved to ${v.resolved})`,
			);
			continue;
		}
		seen.add(v.resolved);
		result.push(v.resolved);
	}

	return result;
}
