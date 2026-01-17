import * as core from '@actions/core';

/**
 * Resolve wildcard versions (10.x, 10.x.x) to concrete versions
 */
export async function resolveVersion(
	version: string,
	type: 'sdk' | 'runtime' | 'aspnetcore',
): Promise<string> {
	// If version has no wildcards, return as-is
	if (!version.includes('x')) {
		return version;
	}

	// Fetch available versions from .NET releases API
	const releasesUrl =
		'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

	try {
		core.debug(`Fetching releases from: ${releasesUrl}`);
		const response = await fetch(releasesUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch releases: ${response.statusText}`);
		}

		const data = (await response.json()) as {
			releases?: Array<{
				'channel-version': string;
				'latest-sdk': string;
				'latest-runtime': string;
			}>;
			'releases-index'?: Array<{
				'channel-version': string;
				'latest-sdk': string;
				'latest-runtime': string;
				'releases.json': string;
			}>;
		};

		const releases = data.releases || data['releases-index'];
		if (!Array.isArray(releases)) {
			throw new Error(
				'Invalid API response: releases data is missing or malformed',
			);
		}

		const versionPattern = version.replace(/\./g, '\\.').replace(/x/g, '\\d+');
		const regex = new RegExp(`^${versionPattern}$`);

		const versionType = type === 'sdk' ? 'sdk' : 'runtime';
		const allVersions = releases.map((r) =>
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
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to resolve version ${version}: ${error.message}`);
		}
		throw error;
	}
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
