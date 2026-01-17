import * as core from '@actions/core';
import { getDotNetInstallDirectory, installDotNet } from './installer';
import type { DotnetType, VersionSet } from './types';
import { generateCacheKey, restoreCache, saveCache } from './utils/cache-utils';
import {
	getDefaultGlobalJsonPath,
	readGlobalJson,
} from './utils/global-json-reader';
import { parseVersions } from './utils/input-parser';
import { deduplicateVersions } from './utils/version-deduplicator';
import { fetchAndCacheReleases } from './utils/version-resolver';

interface InstallationResult {
	version: string;
	type: DotnetType;
	path: string;
}

/**
 * Try to restore .NET installations from cache
 * @returns true if cache was restored successfully, false otherwise
 */
async function tryRestoreFromCache(deduplicated: VersionSet): Promise<boolean> {
	const cacheKey = generateCacheKey(deduplicated);
	const cacheRestored = await restoreCache(cacheKey);

	if (cacheRestored) {
		const installDir = getDotNetInstallDirectory();

		if (!process.env.PATH?.includes(installDir)) {
			core.addPath(installDir);
		}

		core.exportVariable('DOTNET_ROOT', installDir);

		const versions = [
			...deduplicated.sdk.map((v) => `sdk:${v}`),
			...deduplicated.runtime.map((v) => `runtime:${v}`),
			...deduplicated.aspnetcore.map((v) => `aspnetcore:${v}`),
		].join(', ');

		core.setOutput('dotnet-version', versions);
		core.setOutput('dotnet-path', installDir);
		core.setOutput('cache-hit', 'true');
		core.info('✅ Installation complete (from cache)');
		return true;
	}

	return false;
}

/**
 * Save .NET installations to cache
 */
async function trySaveToCache(deduplicated: VersionSet): Promise<void> {
	const cacheKey = generateCacheKey(deduplicated);
	await saveCache(cacheKey);
}

/**
 * Main entry point for the GitHub Action
 */
export async function run(): Promise<void> {
	try {
		const sdkInput = core.getInput('dotnet-sdk');
		const runtimeInput = core.getInput('dotnet-runtime');
		const aspnetcoreInput = core.getInput('dotnet-aspnetcore');
		const globalJsonInput = core.getInput('global-json');
		const cacheEnabled = core.getBooleanInput('cache');

		let sdkVersions: string[] = [];

		// Priority 1: Explicit SDK input
		if (sdkInput) {
			sdkVersions = parseVersions(sdkInput);
			core.info('Using SDK versions from action input');
		} else {
			// Priority 2: global.json
			const globalJsonPath = globalJsonInput || getDefaultGlobalJsonPath();
			core.debug(`Looking for global.json at: ${globalJsonPath}`);

			const globalJsonVersion = await readGlobalJson(globalJsonPath);
			if (globalJsonVersion) {
				sdkVersions = [globalJsonVersion];
				core.info(`Using SDK version from global.json: ${globalJsonVersion}`);
			}
		}

		const runtimeVersions = parseVersions(runtimeInput);
		const aspnetcoreVersions = parseVersions(aspnetcoreInput);

		if (
			sdkVersions.length === 0 &&
			runtimeVersions.length === 0 &&
			aspnetcoreVersions.length === 0
		) {
			throw new Error(
				'At least one of dotnet-sdk, dotnet-runtime, or dotnet-aspnetcore must be specified',
			);
		}

		await fetchAndCacheReleases();

		// Remove redundant versions
		const deduplicated = await deduplicateVersions({
			sdk: sdkVersions,
			runtime: runtimeVersions,
			aspnetcore: aspnetcoreVersions,
		});

		// Try to restore from cache if enabled
		if (cacheEnabled && (await tryRestoreFromCache(deduplicated))) {
			return;
		}

		// Show installation plan
		const installPlan: string[] = [];
		if (deduplicated.sdk.length > 0) {
			installPlan.push(`SDK ${deduplicated.sdk.join(', ')}`);
		}
		if (deduplicated.runtime.length > 0) {
			installPlan.push(`Runtime ${deduplicated.runtime.join(', ')}`);
		}
		if (deduplicated.aspnetcore.length > 0) {
			installPlan.push(`ASP.NET Core ${deduplicated.aspnetcore.join(', ')}`);
		}
		core.info(`Installing .NET: ${installPlan.join(' | ')}`);

		// Prepare installation tasks
		const installTasks: Promise<InstallationResult>[] = [];

		for (const version of deduplicated.sdk) {
			installTasks.push(
				installDotNet({
					version,
					type: 'sdk',
				}),
			);
		}

		for (const version of deduplicated.runtime) {
			installTasks.push(
				installDotNet({
					version,
					type: 'runtime',
				}),
			);
		}

		for (const version of deduplicated.aspnetcore) {
			installTasks.push(
				installDotNet({
					version,
					type: 'aspnetcore',
				}),
			);
		}

		// Install in parallel
		const installStartTime = Date.now();
		const installations = await Promise.all(installTasks);
		const installDuration = ((Date.now() - installStartTime) / 1000).toFixed(2);

		core.info(`✅ Installation complete in ${installDuration}s`);

		// Save to cache if enabled
		if (cacheEnabled) {
			await trySaveToCache(deduplicated);
		}

		// Set outputs
		const versions = installations
			.map((i) => `${i.type}:${i.version}`)
			.join(', ');
		const paths = installations.map((i) => i.path).join(':');

		core.setOutput('dotnet-version', versions);
		core.setOutput('dotnet-path', paths);
		core.setOutput('cache-hit', 'false');
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unknown error occurred');
		}
	}
}

// Run the action
run();
