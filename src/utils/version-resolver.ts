import * as core from '@actions/core';
import type { DotnetType } from '../types';

interface ReleaseInfo {
	'channel-version': string;
	'latest-sdk': string;
	'latest-runtime': string;
	'release-type': string;
}

let cachedReleases: ReleaseInfo[] | null = null;

/**
 * Reset the cached releases (for testing purposes)
 */
export function resetCache(): void {
	cachedReleases = null;
}

/**
 * Set cached releases directly (for testing purposes)
 */
export function setCachedReleases(releases: ReleaseInfo[]): void {
	cachedReleases = releases;
}

/**
 * Initialize the releases cache by fetching from .NET releases API
 * Should be called once at the start before any resolveVersion calls
 */
export async function fetchAndCacheReleases(): Promise<void> {
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
		releases?: ReleaseInfo[];
		'releases-index'?: ReleaseInfo[];
	};

	const releases = data.releases || data['releases-index'];
	if (!Array.isArray(releases)) {
		throw new Error(
			'Invalid API response: releases data is missing or malformed',
		);
	}

	cachedReleases = releases;
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

	// Handle LTS, STS, and LATEST keywords
	if (versionLower === 'lts' || versionLower === 'sts') {
		return resolveSupportTier(versionLower, type);
	}

	if (versionLower === 'latest') {
		return resolveLatest(type);
	}

	// If version has no wildcards, return as-is
	if (!version.includes('x') && !version.includes('X')) {
		return version;
	}

	if (!cachedReleases) {
		throw new Error(
			'Cache not initialized. Call initializeCache() before resolveVersion().',
		);
	}

	// Normalize pattern to 3 parts (10.x -> 10.x.x)
	const normalizedVersion = normalizeVersionPattern(version);
	const versionPattern = normalizedVersion
		.replace(/\./g, '\\.')
		.replace(/[xX]/g, '\\d+');
	const regex = new RegExp(`^${versionPattern}$`);

	const versionType = type === 'sdk' ? 'sdk' : 'runtime';
	const allVersions = cachedReleases.map((r) =>
		versionType === 'sdk' ? r['latest-sdk'] : r['latest-runtime'],
	);

	const matchingVersions = allVersions
		.filter((v) => v && regex.test(v))
		.sort((a, b) => compareVersions(b, a));

	if (matchingVersions.length === 0) {
		core.debug(
			`No versions matched pattern ${version}. Available: ${allVersions.join(', ')}`,
		);
		throw new Error(`No matching version found for pattern: ${version}`);
	}

	core.debug(`Resolved ${version} -> ${matchingVersions[0]}`);
	return matchingVersions[0];
}

/**
 * Resolve LATEST to the newest available version
 */
function resolveLatest(type: DotnetType): string {
	core.debug(`Resolving LATEST version for ${type}`);

	if (!cachedReleases) {
		throw new Error(
			'Cache not initialized. Call initializeCache() before resolveVersion().',
		);
	}

	const versionType = type === 'sdk' ? 'sdk' : 'runtime';

	// Sort releases by channel version (descending) and pick the first
	const sortedReleases = [...cachedReleases].sort((a, b) =>
		compareVersions(b['channel-version'], a['channel-version']),
	);

	if (sortedReleases.length === 0) {
		throw new Error('No releases found');
	}

	const latestRelease = sortedReleases[0];
	const resolvedVersion =
		versionType === 'sdk'
			? latestRelease['latest-sdk']
			: latestRelease['latest-runtime'];

	core.info(
		`Resolved LATEST -> ${resolvedVersion} (channel ${latestRelease['channel-version']})`,
	);
	return resolvedVersion;
}

/**
 * Resolve LTS or STS to the latest version of that support tier
 */
function resolveSupportTier(tier: 'lts' | 'sts', type: DotnetType): string {
	core.debug(`Resolving ${tier.toUpperCase()} version for ${type}`);

	if (!cachedReleases) {
		throw new Error(
			'Cache not initialized. Call initializeCache() before resolveVersion().',
		);
	}

	const supportedReleases = cachedReleases.filter(
		(r) => r['release-type']?.toLowerCase() === tier,
	);

	if (supportedReleases.length === 0) {
		throw new Error(`No ${tier.toUpperCase()} releases found`);
	}

	supportedReleases.sort((a, b) =>
		compareVersions(b['channel-version'], a['channel-version']),
	);

	const latestRelease = supportedReleases[0];
	const versionType = type === 'sdk' ? 'sdk' : 'runtime';
	const resolvedVersion =
		versionType === 'sdk'
			? latestRelease['latest-sdk']
			: latestRelease['latest-runtime'];

	core.info(
		`Resolved ${tier.toUpperCase()} -> ${resolvedVersion} (channel ${latestRelease['channel-version']})`,
	);
	return resolvedVersion;
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
