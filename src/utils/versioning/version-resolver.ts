import * as core from '@actions/core';
import type { DotnetType } from '../../types';

interface ReleaseInfo {
	'channel-version': string;
	'latest-sdk': string;
	'latest-release': string;
	// For some reason, 'latest-runtime' was not the same as 'latest-release'. For now, we will use 'latest-release' only.
	'latest-runtime'?: string;
	'release-type': 'sts' | 'lts';
	'support-phase': string;
}

let cachedReleases: ReleaseInfo[] | null = null;
let allowPreviewReleases = false;

/**
 * Reset the cached releases (for testing purposes)
 */
export function resetCache(): void {
	cachedReleases = null;
	allowPreviewReleases = false;
}

/**
 * Set cached releases directly (for testing purposes)
 */
export function setCachedReleases(
	releases: ReleaseInfo[],
	allowPreview = false,
): void {
	cachedReleases = releases;
	allowPreviewReleases = allowPreview;
}

function getCachedReleasesOrThrow(): ReleaseInfo[] {
	if (!cachedReleases) {
		throw new Error(
			'Cache not initialized. Call initializeCache() before resolveVersion().',
		);
	}
	return cachedReleases;
}

/**
 * Initialize the releases cache by fetching from .NET releases API
 * Should be called once at the start before any resolveVersion calls
 */
export async function fetchAndCacheReleaseInfo(
	allowPreview = false,
): Promise<void> {
	if (cachedReleases) {
		return;
	}

	allowPreviewReleases = allowPreview;

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

	core.debug(`Release Index:\n${JSON.stringify(releases, null, 2)}`);

	cachedReleases = releases;
}

/**
 * Format type label for display in logs
 */
function formatTypeLabel(type: DotnetType): string {
	switch (type) {
		case 'sdk':
			return 'SDK';
		case 'runtime':
			return 'Runtime';
		case 'aspnetcore':
			return 'ASP.NET Core';
	}
}

/**
 * Normalize version pattern to 3-part format
 * Examples: 10.x -> 10.x.x, 10.0 -> 10.0.x
 */
function normalizeVersionPattern(version: string): string {
	const parts = version.split('.');
	while (parts.length < 3) {
		parts.push('x');
	}
	return parts.join('.');
}

/**
 * Resolve wildcard versions (10.x, 10.x.x), 'lts', or 'sts' to concrete versions
 * Cache must be initialized with initializeCache() before calling this function
 */
export function resolveVersion(version: string, type: DotnetType): string {
	const versionLower = version.toLowerCase();

	// If version has no wildcards or keywords, return as-is
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
		);
		const typeLabel = formatTypeLabel(type);
		core.info(
			`Resolved ${versionLower.toUpperCase()} (${typeLabel}) -> ${resolved.value}`,
		);
		return resolved.value;
	}

	if (versionLower === 'latest') {
		const resolved = resolveLatestFromReleases(releases, type);
		const typeLabel = formatTypeLabel(type);
		core.info(`Resolved LATEST (${typeLabel}) -> ${resolved.value}`);
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

/**
 * Resolve LATEST to the newest available version within provided releases
 * Excludes preview releases (support-phase: 'preview') unless allowPreview is true
 */
export function resolveLatestFromReleases(
	releases: ReleaseInfo[],
	type: DotnetType,
): { value: string; channel: string } {
	core.debug(`Resolving LATEST version for ${type}`);
	const versionType = type === 'sdk' ? 'sdk' : 'runtime';

	// Filter out preview releases unless explicitly allowed
	const filteredReleases = allowPreviewReleases
		? releases
		: releases.filter((r) => r['support-phase'] !== 'preview');

	if (filteredReleases.length === 0) {
		throw new Error('No available releases found');
	}

	// First entry is the latest
	const latestRelease = filteredReleases[0];
	const resolvedVersion = pickVersion(latestRelease, versionType);

	return {
		value: resolvedVersion,
		channel: latestRelease['channel-version'],
	};
}

/**
 * Resolve LTS or STS to the latest version of that support tier within provided releases
 * Excludes preview releases (support-phase: 'preview') unless allowPreview is true
 */
export function resolveSupportTierFromReleases(
	releases: ReleaseInfo[],
	tier: 'lts' | 'sts',
	type: DotnetType,
): { value: string; channel: string } {
	core.debug(`Resolving ${tier.toUpperCase()} version for ${type}`);

	const supportedReleases = releases.filter((r) => {
		const matchesTier = r['release-type'] === tier;
		const isNotPreview =
			allowPreviewReleases || r['support-phase'] !== 'preview';
		return matchesTier && isNotPreview;
	});

	if (supportedReleases.length === 0) {
		throw new Error(`No ${tier.toUpperCase()} releases found`);
	}

	// First entry is the latest
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

/**
 * Compare two semantic versions
 */
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
