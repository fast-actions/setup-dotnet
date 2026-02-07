import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	configureEnvironment,
	copyDotnetBinary,
	getDotNetInstallDirectory,
	installVersion,
	isVersionInCache,
} from './installer';
import { getPlatform } from './utils/platform-utils';
import type {
	DotnetType,
	InstallResult,
	VersionEntry,
	VersionInfo,
	VersionSet,
	VersionSetWithPrerelease,
} from './types';
import { restoreUnifiedCache, saveUnifiedCache } from './utils/cache-utils';
import {
	getInstalledVersions,
	isVersionInstalled,
} from './utils/dotnet-detector';
import {
	getDefaultGlobalJsonPath,
	readGlobalJson,
} from './utils/global-json-reader';
import { parseVersions } from './utils/input-parser';
import {
	formatVersionPlan,
	groupInstallationsBySource,
	logInstallationsBySource,
	setActionOutputs,
} from './utils/output-formatter';
import { deduplicateVersions } from './utils/versioning/version-deduplicator';
import { fetchAndCacheReleaseInfo } from './utils/versioning/version-resolver';

interface ActionInputs {
	sdkInput: string;
	runtimeInput: string;
	aspnetcoreInput: string;
	globalJsonInput: string;
	cacheEnabled: boolean;
	allowPreview: boolean;
}

interface AllVersionsInstalledResult {
	allInstalled: boolean;
	inToolCacheTarget?: boolean;
}

async function areAllVersionsInstalled(
	deduplicated: VersionSet,
): Promise<AllVersionsInstalledResult> {
	const installDir = getDotNetInstallDirectory();
	const platform = getPlatform();
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(installDir, dotnetBinary);

	const inToolCacheTarget = fs.existsSync(dotnetPath);
	const installed = inToolCacheTarget
		? await getInstalledVersions(dotnetPath)
		: await getInstalledVersions();

	const allInstalled =
		deduplicated.sdk.every((v) => isVersionInstalled(v, 'sdk', installed)) &&
		deduplicated.runtime.every((v) =>
			isVersionInstalled(v, 'runtime', installed),
		) &&
		deduplicated.aspnetcore.every((v) =>
			isVersionInstalled(v, 'aspnetcore', installed),
		);

	if (!allInstalled) return { allInstalled: false };
	return { allInstalled: true, inToolCacheTarget };
}

function readInputs(): ActionInputs {
	return {
		sdkInput: core.getInput('sdk-version'),
		runtimeInput: core.getInput('runtime-version'),
		aspnetcoreInput: core.getInput('aspnetcore-version'),
		globalJsonInput: core.getInput('global-json'),
		cacheEnabled: core.getBooleanInput('cache'),
		allowPreview: core.getBooleanInput('allow-preview'),
	};
}

async function resolveSdkVersions(inputs: ActionInputs): Promise<VersionInfo> {
	if (inputs.sdkInput) {
		const versions = parseVersions(inputs.sdkInput);
		return { versions, allowPrerelease: inputs.allowPreview };
	}

	const globalJsonPath = inputs.globalJsonInput || getDefaultGlobalJsonPath();
	const globalJsonInfo = await readGlobalJson(globalJsonPath);

	if (globalJsonInfo) {
		core.info(`Using SDK version from global.json: ${globalJsonInfo.version}`);
		return {
			versions: [globalJsonInfo.version],
			allowPrerelease: globalJsonInfo.allowPrerelease,
		};
	}

	return { versions: [], allowPrerelease: inputs.allowPreview };
}

async function resolveRequestedVersions(
	inputs: ActionInputs,
): Promise<VersionSetWithPrerelease> {
	const sdkVersions = await resolveSdkVersions(inputs);
	const runtimeVersions = parseVersions(inputs.runtimeInput);
	const aspnetcoreVersions = parseVersions(inputs.aspnetcoreInput);

	return {
		sdk: sdkVersions,
		runtime: {
			versions: runtimeVersions,
			allowPrerelease: inputs.allowPreview,
		},
		aspnetcore: {
			versions: aspnetcoreVersions,
			allowPrerelease: inputs.allowPreview,
		},
	};
}

function ensureRequestedVersions(versionSet: VersionSetWithPrerelease): void {
	if (
		versionSet.sdk.versions.length === 0 &&
		versionSet.runtime.versions.length === 0 &&
		versionSet.aspnetcore.versions.length === 0
	) {
		throw new Error(
			'At least one of sdk-version, runtime-version, or aspnetcore-version must be specified',
		);
	}
}

function buildVersionEntries(deduplicated: VersionSet): VersionEntry[] {
	const entries: VersionEntry[] = [];

	for (const version of deduplicated.sdk) {
		entries.push({ version, type: 'sdk' });
	}

	for (const version of deduplicated.runtime) {
		entries.push({ version, type: 'runtime' });
	}

	for (const version of deduplicated.aspnetcore) {
		entries.push({ version, type: 'aspnetcore' });
	}

	return entries;
}

async function installVersionsSequentially(
	entries: VersionEntry[],
	type: DotnetType,
): Promise<InstallResult[]> {
	const filtered = entries.filter((e) => e.type === type);
	const results: InstallResult[] = [];

	for (const entry of filtered) {
		const result = await installVersion(entry);
		results.push(result);
	}

	return results;
}

async function installWindowsVersions(
	entries: VersionEntry[],
): Promise<InstallResult[]> {
	const sdkResults = await installVersionsSequentially(entries, 'sdk');
	const aspnetcoreResults = await installVersionsSequentially(
		entries,
		'aspnetcore',
	);
	const runtimeResults = await installVersionsSequentially(entries, 'runtime');

	return [...sdkResults, ...aspnetcoreResults, ...runtimeResults];
}

async function installNonWindowsVersions(
	entries: VersionEntry[],
): Promise<InstallResult[]> {
	const tasks = entries.map((entry) => installVersion(entry));
	return Promise.all(tasks);
}

async function installAllVersions(
	entries: VersionEntry[],
): Promise<InstallResult[]> {
	const platform = getPlatform();

	return platform === 'win'
		? installWindowsVersions(entries)
		: installNonWindowsVersions(entries);
}

async function ensureDotnetBinary(results: InstallResult[]): Promise<void> {
	const hasSdk = results.some((r) => r.type === 'sdk');
	if (hasSdk) return;

	const firstRuntimeFromCache = results.find(
		(r) =>
			(r.type === 'runtime' || r.type === 'aspnetcore') &&
			r.source === 'github-cache' &&
			isVersionInCache(r.version, r.type),
	);

	if (firstRuntimeFromCache) {
		const platform = getPlatform();
		const installDir = getDotNetInstallDirectory();
		const prefix = `[${firstRuntimeFromCache.type.toUpperCase()}]`;
		const cachePath = firstRuntimeFromCache.path;
		await copyDotnetBinary(cachePath, installDir, platform, prefix);
	}
}

async function executeInstallPlan(
	entries: VersionEntry[],
	cacheEnabled: boolean,
): Promise<InstallResult[]> {
	const startTime = Date.now();
	const platform = getPlatform();

	let cacheRestored = false;
	if (cacheEnabled) {
		core.debug('Attempting to restore unified cache');
		cacheRestored = await restoreUnifiedCache(entries);
		if (cacheRestored) {
			core.debug('Unified cache restored');
		}
	}

	const results = await installAllVersions(entries);

	await ensureDotnetBinary(results);

	configureEnvironment(true);

	if (cacheEnabled && !cacheRestored && platform !== 'win') {
		core.debug('Saving unified cache');
		await saveUnifiedCache(entries);
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${duration}s`);

	return results;
}

function getCacheHitStatusFromResults(results: InstallResult[]): boolean {
	if (results.length === 0) {
		return false;
	}

	const githubCacheCount = results.filter(
		(r) => r.source === 'github-cache',
	).length;

	return githubCacheCount === results.length;
}

function setOutputsFromInstallations(results: InstallResult[]): void {
	const versions = results.map((r) => `${r.type}:${r.version}`).join(', ');
	const installDir = getDotNetInstallDirectory();
	const cacheHit = getCacheHitStatusFromResults(results);

	setActionOutputs(versions, installDir, cacheHit);

	const grouped = groupInstallationsBySource(results);
	logInstallationsBySource(grouped);
}

export async function run(): Promise<void> {
	try {
		const inputs = readInputs();
		const requestedVersions = await resolveRequestedVersions(inputs);

		ensureRequestedVersions(requestedVersions);
		await fetchAndCacheReleaseInfo();

		const deduplicated = await deduplicateVersions(requestedVersions);

		const allInstalledCheck = await areAllVersionsInstalled(deduplicated);
		if (allInstalledCheck.allInstalled) {
			core.info(
				'✅ All requested versions are already installed on the system',
			);
			configureEnvironment(allInstalledCheck.inToolCacheTarget === true);
			return;
		}

		const versionEntries = buildVersionEntries(deduplicated);
		core.info(`Installing: ${formatVersionPlan(deduplicated)}`);

		const results = await executeInstallPlan(
			versionEntries,
			inputs.cacheEnabled,
		);
		setOutputsFromInstallations(results);
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unknown error occurred');
		}
	}
}

await run();
