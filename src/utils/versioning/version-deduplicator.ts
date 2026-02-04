import * as core from '@actions/core';
import type { VersionSet, VersionSetWithPrerelease } from '../../types';
import { getSdkIncludedVersions } from './sdk-runtime-mapper';
import { resolveVersion } from './version-resolver';

// Remove redundant versions based on .NET hierarchy: SDK > ASP.NET Core Runtime > .NET Runtime
export async function deduplicateVersions(
	versions: VersionSetWithPrerelease,
): Promise<VersionSet> {
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

	const sdkSet = new Set(resolvedSdk.map((v) => v.resolved));
	const aspnetcoreSet = new Set(resolvedAspnetcore.map((v) => v.resolved));

	const sdkIncludedVersions = await Promise.all(
		resolvedSdk.map(async (sdk) => ({
			sdk: sdk.resolved,
			included: await getSdkIncludedVersions(sdk.resolved),
		})),
	);

	const sdkIncludedRuntimes = new Set<string>();
	for (const { sdk, included } of sdkIncludedVersions) {
		if (included.runtime) {
			sdkIncludedRuntimes.add(included.runtime);
			core.debug(`SDK ${sdk} includes runtime ${included.runtime}`);
		}
	}

	const filteredRuntime = resolvedRuntime.filter((v) => {
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

	const filteredAspnetcore = resolvedAspnetcore.filter((v) => {
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
