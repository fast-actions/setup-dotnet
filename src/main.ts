import * as core from '@actions/core';
import { getDotNetInstallDirectory, installDotNet } from './installer';
import type { DotnetType, VersionSet } from './types';
import { generateCacheKey, restoreCache, saveCache } from './utils/cache-utils';
import {
	getDefaultGlobalJsonPath,
	readGlobalJson,
} from './utils/global-json-reader';
import { parseVersions } from './utils/input-parser';
import { deduplicateVersions } from './utils/versioning/version-deduplicator';
import { fetchAndCacheReleases } from './utils/versioning/version-resolver';

interface InstallationResult {
	version: string;
	type: DotnetType;
	path: string;
}

interface ActionInputs {
	sdkInput: string;
	runtimeInput: string;
	aspnetcoreInput: string;
	globalJsonInput: string;
	cacheEnabled: boolean;
}

interface InstallPlanItem {
	version: string;
	type: DotnetType;
}

/**
 * Format version plan for display
 */
function formatVersionPlan(deduplicated: VersionSet): string {
	const parts: string[] = [];
	if (deduplicated.sdk.length > 0) {
		parts.push(`SDK ${deduplicated.sdk.join(', ')}`);
	}
	if (deduplicated.runtime.length > 0) {
		parts.push(`Runtime ${deduplicated.runtime.join(', ')}`);
	}
	if (deduplicated.aspnetcore.length > 0) {
		parts.push(`ASP.NET Core ${deduplicated.aspnetcore.join(', ')}`);
	}
	return parts.join(' | ');
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

		core.info(`Restored .NET from cache: ${formatVersionPlan(deduplicated)}`);

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

function readInputs(): ActionInputs {
	return {
		sdkInput: core.getInput('sdk-version'),
		runtimeInput: core.getInput('runtime-version'),
		aspnetcoreInput: core.getInput('aspnetcore-version'),
		globalJsonInput: core.getInput('global-json'),
		cacheEnabled: core.getBooleanInput('cache'),
	};
}

async function resolveSdkVersions(inputs: ActionInputs): Promise<string[]> {
	if (inputs.sdkInput) {
		core.info('Using SDK versions from action input');
		return parseVersions(inputs.sdkInput);
	}

	const globalJsonPath = inputs.globalJsonInput || getDefaultGlobalJsonPath();
	core.debug(`Looking for global.json at: ${globalJsonPath}`);

	const globalJsonVersion = await readGlobalJson(globalJsonPath);
	if (globalJsonVersion) {
		core.info(`Using SDK version from global.json: ${globalJsonVersion}`);
		return [globalJsonVersion];
	}

	return [];
}

async function resolveRequestedVersions(
	inputs: ActionInputs,
): Promise<VersionSet> {
	const sdkVersions = await resolveSdkVersions(inputs);
	const runtimeVersions = parseVersions(inputs.runtimeInput);
	const aspnetcoreVersions = parseVersions(inputs.aspnetcoreInput);

	return {
		sdk: sdkVersions,
		runtime: runtimeVersions,
		aspnetcore: aspnetcoreVersions,
	};
}

function ensureRequestedVersions(versionSet: VersionSet): void {
	if (
		versionSet.sdk.length === 0 &&
		versionSet.runtime.length === 0 &&
		versionSet.aspnetcore.length === 0
	) {
		throw new Error(
			'At least one of sdk-version, runtime-version, or aspnetcore-version must be specified',
		);
	}
}

async function handleCacheRestore(
	deduplicated: VersionSet,
	cacheEnabled: boolean,
): Promise<boolean> {
	if (!cacheEnabled) {
		return false;
	}
	return tryRestoreFromCache(deduplicated);
}

async function handleCacheSave(
	deduplicated: VersionSet,
	cacheEnabled: boolean,
): Promise<void> {
	if (!cacheEnabled) {
		return;
	}
	await trySaveToCache(deduplicated);
}

function buildInstallPlan(deduplicated: VersionSet): InstallPlanItem[] {
	const plan: InstallPlanItem[] = [];

	for (const version of deduplicated.sdk) {
		plan.push({ version, type: 'sdk' });
	}

	for (const version of deduplicated.runtime) {
		plan.push({ version, type: 'runtime' });
	}

	for (const version of deduplicated.aspnetcore) {
		plan.push({ version, type: 'aspnetcore' });
	}

	return plan;
}

async function executeInstallPlan(
	plan: InstallPlanItem[],
): Promise<InstallationResult[]> {
	const installTasks = plan.map((item) =>
		installDotNet({
			version: item.version,
			type: item.type,
		}),
	);

	const installStartTime = Date.now();
	const installations = await Promise.all(installTasks);
	const installDuration = ((Date.now() - installStartTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${installDuration}s`);

	return installations;
}

function setOutputsFromInstallations(
	installations: InstallationResult[],
	cacheHit: boolean,
): void {
	const versions = installations
		.map((i) => `${i.type}:${i.version}`)
		.join(', ');
	const paths = installations.map((i) => i.path).join(':');

	core.setOutput('dotnet-version', versions);
	core.setOutput('dotnet-path', paths);
	core.setOutput('cache-hit', cacheHit ? 'true' : 'false');
}

/**
 * Main entry point for the GitHub Action
 */
export async function run(): Promise<void> {
	try {
		const inputs = readInputs();
		const requestedVersions = await resolveRequestedVersions(inputs);

		ensureRequestedVersions(requestedVersions);
		await fetchAndCacheReleases();

		// Remove redundant versions
		const deduplicated = await deduplicateVersions(requestedVersions);

		// Try to restore from cache if enabled
		if (await handleCacheRestore(deduplicated, inputs.cacheEnabled)) {
			return;
		}

		core.info(`Installing .NET: ${formatVersionPlan(deduplicated)}`);

		const plan = buildInstallPlan(deduplicated);
		const installations = await executeInstallPlan(plan);

		// Save to cache if enabled
		await handleCacheSave(deduplicated, inputs.cacheEnabled);

		setOutputsFromInstallations(installations, false);
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
