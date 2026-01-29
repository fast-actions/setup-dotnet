import * as core from '@actions/core';
import { fetchReleaseManifest } from './release-cache';

export async function getSdkIncludedVersions(sdkVersion: string): Promise<{
	runtime: string | null;
	aspnetcore: string | null;
}> {
	try {
		core.debug(`Getting SDK-included versions for SDK ${sdkVersion}`);

		const data = await fetchReleaseManifest(sdkVersion);

		// Find the SDK release
		const release = data.releases.find((r) =>
			r.sdks?.some((s) => s.version === sdkVersion),
		);

		if (!release) {
			core.debug(`SDK version ${sdkVersion} not found in releases`);
			return { runtime: null, aspnetcore: null };
		}

		const result = {
			runtime: release.runtime?.version || null,
			aspnetcore: release['aspnetcore-runtime']?.version || null,
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
