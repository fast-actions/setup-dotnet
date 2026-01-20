import * as core from '@actions/core';
import type { ReleaseManifest } from '../../types';

// Cache for releases.json API responses (promise-based for parallel-safe access)
const releasesCache = new Map<string, Promise<ReleaseManifest>>();

/**
 * Fetch releases.json for a specific version channel
 * Uses promise-based caching to prevent concurrent duplicate requests
 */
export async function fetchReleaseManifest(
	version: string,
): Promise<ReleaseManifest> {
	// Extract channel version (e.g., "8.0.100" -> "8.0")
	const versionParts = version.split('.');
	if (versionParts.length < 2) {
		throw new Error(`Invalid version format: ${version}`);
	}
	const channel = `${versionParts[0]}.${versionParts[1]}`;

	// Check cache first
	const cacheKey = channel;
	const cached = releasesCache.get(cacheKey);
	if (cached) {
		core.debug(`Using cached release manifest for channel ${channel}`);
		return cached;
	}

	// Create promise and cache it immediately (prevents duplicate requests)
	const fetchPromise = (async () => {
		const releasesUrl = `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${channel}/releases.json`;
		core.debug(`Fetching release manifest: ${releasesUrl}`);

		const response = await fetch(releasesUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to fetch releases for channel ${channel}: ${response.statusText}`,
			);
		}

		const data = (await response.json()) as ReleaseManifest;
		if (!data.releases || !Array.isArray(data.releases)) {
			throw new Error(
				`Invalid manifest structure for channel ${channel}: missing releases array`,
			);
		}

		core.debug(
			`Fetched manifest for channel ${channel} with ${data.releases.length} releases`,
		);
		return data;
	})();

	releasesCache.set(cacheKey, fetchPromise);
	return fetchPromise;
}

/**
 * Clear the release cache (for testing purposes)
 */
export function clearReleaseCache(): void {
	releasesCache.clear();
}
