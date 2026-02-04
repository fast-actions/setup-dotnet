import * as core from '@actions/core';
import type { DotnetType } from '../../types';
import type { ReleaseInfo, ResolvedVersion } from './versioning.types';

let cachedReleases: ReleaseInfo[] | null = null;

export function resetCache(): void {
	cachedReleases = null;
}

export function setCachedReleases(releases: ReleaseInfo[]): void {
	cachedReleases = releases;
}

function getCachedReleasesOrThrow(): ReleaseInfo[] {
	if (!cachedReleases) {
		throw new Error(
			'Cache not initialized. Call initializeCache() before resolveVersion().',
		);
	}
	return cachedReleases;
}

export async function fetchAndCacheReleaseInfo(): Promise<void> {
	if (cachedReleases) {
		return;
	}

	const releasesUrl =
		'https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json';

	core.debug(`Fetching releases from: ${releasesUrl}`);
	const response = await fetch(releasesUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch releases: ${response.statusText}`);
	}

	const data = (await response.json()) as {
		'releases-index': ReleaseInfo[];
	};

	const releases = data['releases-index'];
	if (!Array.isArray(releases)) {
		throw new Error(
			'Invalid API response: releases data is missing or malformed',
		);
	}

	if (core.isDebug()) {
		core.debug(`Release Index:\n${JSON.stringify(releases, null, 2)}`);
	}

	cachedReleases = releases;
}

// Examples: 10.x -> 10.x.x, 10.0 -> 10.0.x
function normalizeVersionPattern(version: string): string {
	const parts = version.split('.');
	while (parts.length < 3) {
		parts.push('x');
	}
	return parts.join('.');
}

export function resolveVersion(
	version: string,
	type: DotnetType,
	allowPreview: boolean,
): string {
	const versionLower = version.toLowerCase();

	if (
		!versionLower.includes('x') &&
		versionLower !== 'lts' &&
		versionLower !== 'sts' &&
		versionLower !== 'latest'
	) {
		return version;
	}

	const releases = getCachedReleasesOrThrow();

	if (versionLower === 'lts' || versionLower === 'sts') {
		const resolved = resolveSupportTierFromReleases(
			releases,
			versionLower,
			type,
			allowPreview,
		);
		core.info(
			`Resolved ${versionLower.toUpperCase()} (${type.toUpperCase()}) -> ${resolved.value}`,
		);
		return resolved.value;
	}

	if (versionLower === 'latest') {
		const resolved = resolveLatestFromReleases(releases, type, allowPreview);
		core.info(`Resolved LATEST (${type.toUpperCase()}) -> ${resolved.value}`);
		return resolved.value;
	}

	const resolved = resolveVersionPatternFromReleases(
		releases,
		versionLower,
		type,
	);
	core.debug(`Resolved ${version} -> ${resolved}`);
	return resolved;
}

function resolveLatestFromReleases(
	releases: ReleaseInfo[],
	type: DotnetType,
	allowPreview: boolean,
): ResolvedVersion {
	core.debug(`Resolving LATEST version for ${type}`);
	const versionType = type === 'sdk' ? 'sdk' : 'runtime';

	const filteredReleases = allowPreview
		? releases
		: releases.filter((r) => r['support-phase'] !== 'preview');

	if (filteredReleases.length === 0) {
		throw new Error('No available releases found');
	}

	const latestRelease = filteredReleases[0];
	const resolvedVersion = pickVersion(latestRelease, versionType);

	return {
		value: resolvedVersion,
		channel: latestRelease['channel-version'],
	};
}

function resolveSupportTierFromReleases(
	releases: ReleaseInfo[],
	tier: 'lts' | 'sts',
	type: DotnetType,
	allowPreview: boolean,
): ResolvedVersion {
	core.debug(`Resolving ${tier.toUpperCase()} version for ${type}`);

	const supportedReleases = releases.filter((r) => {
		const matchesTier = r['release-type'] === tier;
		const isNotPreview = allowPreview || r['support-phase'] !== 'preview';
		return matchesTier && isNotPreview;
	});

	if (supportedReleases.length === 0) {
		throw new Error(`No ${tier.toUpperCase()} releases found`);
	}

	const latestRelease = supportedReleases[0];
	const versionType = type === 'sdk' ? 'sdk' : 'runtime';
	const resolvedVersion = pickVersion(latestRelease, versionType);

	return {
		value: resolvedVersion,
		channel: latestRelease['channel-version'],
	};
}

function resolveVersionPatternFromReleases(
	releases: ReleaseInfo[],
	version: string,
	type: DotnetType,
): string {
	// Normalize pattern to 3 parts (10.x -> 10.x.x)
	const normalizedVersion = normalizeVersionPattern(version);
	const versionPattern = normalizedVersion
		.replaceAll('.', '\\.')
		.replaceAll('x', '\\d+');
	const regex = new RegExp(`^${versionPattern}$`);

	const versionType = type === 'sdk' ? 'sdk' : 'runtime';
	const allVersions = releases.map((r) => pickVersion(r, versionType));

	const matchingVersions = allVersions
		.filter((v) => v && regex.test(v))
		.sort((a, b) => compareVersions(b, a));

	if (matchingVersions.length === 0) {
		core.debug(
			`No versions matched pattern ${version}. Available: ${allVersions.join(', ')}`,
		);
		throw new Error(`No matching version found for pattern: ${version}`);
	}

	return matchingVersions[0];
}

function pickVersion(
	release: ReleaseInfo,
	versionType: 'sdk' | 'runtime',
): string {
	return versionType === 'sdk'
		? release['latest-sdk']
		: release['latest-release'];
}

export function compareVersions(a: string, b: string): number {
	const aParts = a.split('.').map(Number);
	const bParts = b.split('.').map(Number);

	for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
		const aPart = aParts[i] || 0;
		const bPart = bParts[i] || 0;
		if (aPart !== bPart) {
			return aPart - bPart;
		}
	}
	return 0;
}
