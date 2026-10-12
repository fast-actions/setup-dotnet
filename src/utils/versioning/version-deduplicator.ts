import * as core from '@actions/core';
import type {
	DotnetType,
	VersionInfo,
	VersionSet,
	VersionSetWithPrerelease,
} from '../../types';
import { getSdkIncludedVersions } from './sdk-runtime-mapper';
import { resolveVersion } from './version-resolver';

interface ResolvedEntry {
	original: string;
	resolved: string;
}

function resolveAll(
	versionInfo: VersionInfo,
	type: DotnetType,
): ResolvedEntry[] {
	return versionInfo.versions.map((version) => ({
		original: version,
		resolved: resolveVersion(version, type, versionInfo.allowPrerelease),
	}));
}

// Remove redundant versions based on .NET hierarchy: SDK > ASP.NET Core Runtime > .NET Runtime
export async function deduplicateVersions(
	versions: VersionSetWithPrerelease,
): Promise<VersionSet> {
	const resolvedSdk = resolveAll(versions.sdk, 'sdk');
	const resolvedRuntime = resolveAll(versions.runtime, 'runtime');
	const resolvedAspnetcore = resolveAll(versions.aspnetcore, 'aspnetcore');

	const sdkSet = new Set(resolvedSdk.map((entry) => entry.resolved));
	const aspnetcoreSet = new Set(
		resolvedAspnetcore.map((entry) => entry.resolved),
	);

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

	const filteredRuntime = resolvedRuntime.filter((entry) => {
		if (sdkIncludedRuntimes.has(entry.resolved)) {
			core.info(
				`Skipping redundant Runtime ${entry.original} (included in SDK)`,
			);
			return false;
		}
		if (aspnetcoreSet.has(entry.resolved) || sdkSet.has(entry.resolved)) {
			core.info(
				`Skipping redundant Runtime ${entry.original} (covered by ${aspnetcoreSet.has(entry.resolved) ? 'ASP.NET Core' : 'SDK'})`,
			);
			return false;
		}
		return true;
	});

	const filteredAspnetcore = resolvedAspnetcore.filter((entry) => {
		if (sdkIncludedRuntimes.has(entry.resolved)) {
			core.info(
				`Skipping redundant ASP.NET Core ${entry.original} (included in SDK)`,
			);
			return false;
		}
		if (sdkSet.has(entry.resolved)) {
			core.info(
				`Skipping redundant ASP.NET Core ${entry.original} (covered by SDK)`,
			);
			return false;
		}
		return true;
	});

	return {
		sdk: removeDuplicatesWithinType(resolvedSdk, 'SDK'),
		runtime: removeDuplicatesWithinType(filteredRuntime, 'Runtime'),
		aspnetcore: removeDuplicatesWithinType(filteredAspnetcore, 'ASP.NET Core'),
	};
}

function removeDuplicatesWithinType(
	entries: ResolvedEntry[],
	typeLabel: string,
): string[] {
	const seen = new Set<string>();

	for (const entry of entries) {
		if (seen.has(entry.resolved)) {
			core.info(
				`Skipping duplicate ${typeLabel} ${entry.original} (already resolved to ${entry.resolved})`,
			);
			continue;
		}
		seen.add(entry.resolved);
	}

	return [...seen];
}
