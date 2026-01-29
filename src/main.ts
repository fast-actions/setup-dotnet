import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	configureEnvironment,
	copyDotnetBinary,
	getDotNetInstallDirectory,
	installVersion,
	isVersionInCache,
	type InstallResult,
} from './installer';
import { getPlatform } from './utils/platform-utils';
import type {
	DotnetType,
	VersionInfo,
	VersionSet,
	VersionSetWithPrerelease,
} from './types';
import {
	restoreUnifiedCache,
	saveUnifiedCache,
	type VersionEntry,
} from './utils/cache-utils';
import {
	getInstalledVersions,
	isVersionInstalled,
} from './utils/dotnet-detector';
import {
	getDefaultGlobalJsonPath,
	readGlobalJson,
} from './utils/global-json-reader';
import { parseVersions } from './utils/input-parser';
import { deduplicateVersions } from './utils/versioning/version-deduplicator';
import {
	fetchAndCacheReleaseInfo,
	formatTypeLabel,
} from './utils/versioning/version-resolver';

interface ActionInputs {
	sdkInput: string;
	runtimeInput: string;
	aspnetcoreInput: string;
	globalJsonInput: string;
	cacheEnabled: boolean;
	allowPreview: boolean;
}

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

function setActionOutputs(
	versions: string,
	installDir: string,
	cacheHit: boolean,
): void {
	core.setOutput('dotnet-version', versions);
	core.setOutput('dotnet-path', installDir);
	core.setOutput('cache-hit', cacheHit);
}

async function areAllVersionsInstalled(
	deduplicated: VersionSet,
): Promise<boolean> {
	const installDir = getDotNetInstallDirectory();
	const platform = getPlatform();
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(installDir, dotnetBinary);

	const installed = fs.existsSync(dotnetPath)
		? await getInstalledVersions(dotnetPath)
		: await getInstalledVersions();

	return (
		deduplicated.sdk.every((v) => isVersionInstalled(v, 'sdk', installed)) &&
		deduplicated.runtime.every((v) =>
			isVersionInstalled(v, 'runtime', installed),
		) &&
		deduplicated.aspnetcore.every((v) =>
			isVersionInstalled(v, 'aspnetcore', installed),
		)
	);
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

	const installDir = getDotNetInstallDirectory();
	configureEnvironment(installDir);

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

function sortByType(results: InstallResult[]): InstallResult[] {
	const typeOrder: Record<DotnetType, number> = {
		sdk: 0,
		runtime: 1,
		aspnetcore: 2,
	};
	return [...results].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
}

function formatVersion(type: DotnetType, version: string): string {
	const typeLabel = formatTypeLabel(type);
	return `${typeLabel} ${version}`;
}

interface InstallationsBySource {
	alreadyInstalled: InstallResult[];
	githubCache: InstallResult[];
	downloaded: InstallResult[];
}

function groupInstallationsBySource(
	results: InstallResult[],
): InstallationsBySource {
	return {
		alreadyInstalled: results.filter(
			(r) => r.source === 'installation-directory',
		),
		githubCache: results.filter((r) => r.source === 'github-cache'),
		downloaded: results.filter((r) => r.source === 'download'),
	};
}

function formatVersionsList(results: InstallResult[]): string {
	return sortByType(results)
		.map((r) => formatVersion(r.type, r.version))
		.join(' | ');
}

function logInstallationsBySource(grouped: InstallationsBySource): void {
	const sources: Array<[string, InstallResult[]]> = [
		['Already installed', grouped.alreadyInstalled],
		['Restored from cache', grouped.githubCache],
		['Downloaded', grouped.downloaded],
	];

	for (const [label, results] of sources) {
		if (results.length > 0) {
			core.info(`${label}: ${formatVersionsList(results)}`);
		}
	}
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

		if (await areAllVersionsInstalled(deduplicated)) {
			core.info(
				'✅ All requested versions are already installed on the system',
			);
			const installDir = getDotNetInstallDirectory();
			configureEnvironment(installDir);
			return;
		}

		core.info('At least one requested version is not installed on the system');

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
