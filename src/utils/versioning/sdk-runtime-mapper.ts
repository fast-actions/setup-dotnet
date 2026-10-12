import * as core from '@actions/core';
import type { SdkIncludedVersions } from '../../types';
import { fetchReleaseManifest } from './release-cache';

export async function getSdkIncludedVersions(
	sdkVersion: string,
): Promise<SdkIncludedVersions> {
	try {
		core.debug(`Getting SDK-included versions for SDK ${sdkVersion}`);

		const data = await fetchReleaseManifest(sdkVersion);

		const release = data.releases.find((candidate) =>
			candidate.sdks?.some((sdk) => sdk.version === sdkVersion),
		);

		if (!release) {
			core.debug(`SDK version ${sdkVersion} not found in releases`);
			return { runtime: null, aspnetcore: null };
		}

		const result: SdkIncludedVersions = {
			runtime: release.runtime?.version || null,
			aspnetcore: release['aspnetcore-runtime']?.version || null,
		};

		core.debug(
			`SDK ${sdkVersion} includes: runtime=${result.runtime}, aspnetcore=${result.aspnetcore}`,
		);

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.debug(
			`Error fetching SDK-included versions for ${sdkVersion}: ${errorMessage}`,
		);
		return { runtime: null, aspnetcore: null };
	}
}
