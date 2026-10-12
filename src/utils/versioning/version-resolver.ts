import * as core from '@actions/core';
import type { DotnetType, ReleaseInfo } from '../../types';
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
			'Cache not initialized. Call fetchAndCacheReleaseInfo() before resolveVersion().',
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

const KEYWORDS = ['lts', 'sts', 'latest'];

export function resolveVersion(
	version: string,
	type: DotnetType,
	allowPreview: boolean,
): string {
	const versionLower = version.toLowerCase();
	const isKeyword = KEYWORDS.includes(versionLower);

	if (!isKeyword && !versionLower.includes('x')) {
		return version;
	}

	const releases = getCachedReleasesOrThrow();

	if (isKeyword) {
		const resolved = resolveKeywordFromReleases(
			releases,
			versionLower,
			type,
			allowPreview,
		);
		core.info(
			`Resolved ${versionLower.toUpperCase()} (${type.toUpperCase()}) -> ${resolved}`,
		);
		return resolved;
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

// The releases index is ordered newest first, so the first match is the latest.
function resolveKeywordFromReleases(
	releases: ReleaseInfo[],
	keyword: string,
	type: DotnetType,
	allowPreview: boolean,
): string {
	core.debug(`Resolving ${keyword.toUpperCase()} version for ${type}`);

	const latestRelease = releases.find(
		(release) =>
			(keyword === 'latest' || release['release-type'] === keyword) &&
			(allowPreview || release['support-phase'] !== 'preview'),
	);

	if (!latestRelease) {
		throw new Error(
			keyword === 'latest'
				? 'No available releases found'
				: `No ${keyword.toUpperCase()} releases found`,
		);
	}

	return pickVersion(latestRelease, type);
}

function resolveVersionPatternFromReleases(
	releases: ReleaseInfo[],
	version: string,
	type: DotnetType,
	allowPreview: boolean,
): string {
	const versionPattern = normalizeVersionPattern(version)
		.replaceAll('.', '\\.')
		.replaceAll('x', '\\d+');
	const prereleaseSuffix = allowPreview ? '(-[0-9A-Za-z.]+)?' : '';
	const regex = new RegExp(`^${versionPattern}${prereleaseSuffix}$`);

	const allVersions = releases.map((release) => pickVersion(release, type));

	const matchingVersions = allVersions
		.filter((candidate) => candidate && regex.test(candidate))
		.sort((a, b) => compareVersions(b, a));

	if (matchingVersions.length === 0) {
		core.debug(
			`No versions matched pattern ${version}. Available: ${allVersions.join(', ')}`,
		);
		throw new Error(`No matching version found for pattern: ${version}`);
	}

	return matchingVersions[0];
}

function pickVersion(release: ReleaseInfo, type: DotnetType): string {
	return type === 'sdk' ? release['latest-sdk'] : release['latest-release'];
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
