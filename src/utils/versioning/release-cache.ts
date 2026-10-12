import * as core from '@actions/core';
import type { ReleaseManifest } from '../../types';
import { fetchWithRetry } from '../fetch-with-retry';

// Caches the pending promise per channel so parallel callers share one request
const releasesCache = new Map<string, Promise<ReleaseManifest>>();

export async function fetchReleaseManifest(
	version: string,
): Promise<ReleaseManifest> {
	const versionParts = version.split('.');
	if (versionParts.length < 2) {
		throw new Error(`Invalid version format: ${version}`);
	}
	const channel = `${versionParts[0]}.${versionParts[1]}`;

	const cached = releasesCache.get(channel);
	if (cached) {
		core.debug(`Using cached release manifest for channel ${channel}`);
		return cached;
	}

	const fetchPromise = (async () => {
		const releasesUrl = `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${channel}/releases.json`;
		core.debug(`Fetching release manifest: ${releasesUrl}`);

		const response = await fetchWithRetry(releasesUrl);
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

	releasesCache.set(channel, fetchPromise);
	// Don't keep a rejected promise cached: a transient failure for one channel
	// must not break that channel for the rest of the run.
	void fetchPromise.catch(() => releasesCache.delete(channel));
	return fetchPromise;
}

export function clearReleaseCache(): void {
	releasesCache.clear();
}
