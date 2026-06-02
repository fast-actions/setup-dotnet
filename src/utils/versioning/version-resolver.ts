import * as core from '@actions/core';
import type { DotnetType, ReleaseInfo, ResolvedVersion } from '../../types';
import { fetchWithRetry } from '../fetch-with-retry';

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
	const response = await fetchWithRetry(releasesUrl);
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
		allowPreview,
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
	allowPreview: boolean,
): string {
	// Normalize pattern to 3 parts (10.x -> 10.x.x)
	const normalizedVersion = normalizeVersionPattern(version);
	const versionPattern = normalizedVersion
		.replaceAll('.', '\\.')
		.replaceAll('x', '\\d+');
	const prereleaseSuffix = allowPreview ? '(-[0-9A-Za-z.]+)?' : '';
	const regex = new RegExp(`^${versionPattern}${prereleaseSuffix}$`);

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
	const [aMain, aPrerelease] = splitVersion(a);
	const [bMain, bPrerelease] = splitVersion(b);

	const mainComparison = compareMainVersion(aMain, bMain);
	if (mainComparison !== 0) {
		return mainComparison;
	}

	// A version without a prerelease ranks higher than one with (SemVer §11).
	if (!aPrerelease && !bPrerelease) {
		return 0;
	}
	if (!aPrerelease) {
		return 1;
	}
	if (!bPrerelease) {
		return -1;
	}
	return comparePrerelease(aPrerelease, bPrerelease);
}

function splitVersion(version: string): [string, string] {
	const dashIndex = version.indexOf('-');
	if (dashIndex === -1) {
		return [version, ''];
	}
	return [version.slice(0, dashIndex), version.slice(dashIndex + 1)];
}

function compareMainVersion(a: string, b: string): number {
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

function comparePrerelease(a: string, b: string): number {
	const aIdentifiers = a.split('.');
	const bIdentifiers = b.split('.');

	for (let i = 0; i < Math.max(aIdentifiers.length, bIdentifiers.length); i++) {
		const aIdentifier = aIdentifiers[i];
		const bIdentifier = bIdentifiers[i];

		// More identifiers rank higher when the preceding ones are equal.
		if (aIdentifier === undefined) {
			return -1;
		}
		if (bIdentifier === undefined) {
			return 1;
		}

		const comparison = comparePrereleaseIdentifier(aIdentifier, bIdentifier);
		if (comparison !== 0) {
			return comparison;
		}
	}
	return 0;
}

function comparePrereleaseIdentifier(a: string, b: string): number {
	const aIsNumeric = /^\d+$/.test(a);
	const bIsNumeric = /^\d+$/.test(b);

	if (aIsNumeric && bIsNumeric) {
		return Number(a) - Number(b);
	}
	// Numeric identifiers always rank lower than alphanumeric ones (SemVer §11).
	if (aIsNumeric) {
		return -1;
	}
	if (bIsNumeric) {
		return 1;
	}
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}
