import * as core from '@actions/core';

interface ReleaseInfo {
	sdk?: {
		version: string;
	};
	runtime?: {
		version: string;
	};
	aspnetcore?: {
		version: string;
	};
}

interface ReleasesResponse {
	releases: ReleaseInfo[];
}

/**
 * Get the runtime and aspnetcore versions included in an SDK
 */
export async function getSdkIncludedVersions(sdkVersion: string): Promise<{
	runtime: string | null;
	aspnetcore: string | null;
}> {
	// Extract channel version (e.g., "7.0.100" -> "7.0")
	const versionParts = sdkVersion.split('.');
	if (versionParts.length < 2) {
		return { runtime: null, aspnetcore: null };
	}
	const channel = `${versionParts[0]}.${versionParts[1]}`;

	const releasesUrl = `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${channel}/releases.json`;

	try {
		core.debug(
			`Fetching SDK-included versions from: ${releasesUrl} for SDK ${sdkVersion}`,
		);
		const response = await fetch(releasesUrl);
		if (!response.ok) {
			core.debug(
				`Failed to fetch releases for channel ${channel}: ${response.statusText}`,
			);
			return { runtime: null, aspnetcore: null };
		}

		const data = (await response.json()) as ReleasesResponse;

		// Find the SDK release
		const release = data.releases.find((r) => r.sdk?.version === sdkVersion);

		if (!release) {
			core.debug(`SDK version ${sdkVersion} not found in releases`);
			return { runtime: null, aspnetcore: null };
		}

		const result = {
			runtime: release.runtime?.version || null,
			aspnetcore: release.aspnetcore?.version || null,
		};

		core.debug(
			`SDK ${sdkVersion} includes: runtime=${result.runtime}, aspnetcore=${result.aspnetcore}`,
		);

		return result;
	} catch (error) {
		core.debug(
			`Error fetching SDK-included versions for ${sdkVersion}: ${error}`,
		);
		return { runtime: null, aspnetcore: null };
	}
}
