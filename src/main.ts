import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	configureEnvironment,
	copyDotnetBinary,
	copyInstallation,
	getDotNetInstallDirectory,
	prepareInstallation,
} from './installer';
import { getPlatform } from './utils/platform-utils';
import type {
	DotnetType,
	InstallSource,
	VersionInfo,
	VersionSet,
	VersionSetWithPrerelease,
} from './types';
import type { CacheHitStatus } from './utils/cache-utils';
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

interface InstallationResult {
	version: string;
	type: DotnetType;
	path: string;
	cacheHit: boolean;
	source: InstallSource;
}

interface ActionInputs {
	sdkInput: string;
	runtimeInput: string;
	aspnetcoreInput: string;
	globalJsonInput: string;
	cacheEnabled: boolean;
	allowPreview: boolean;
}

interface InstallPlanItem {
	version: string;
	type: DotnetType;
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
	cacheHit: CacheHitStatus,
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

interface PreparedInstallation {
	version: string;
	type: DotnetType;
	extractedPath: string;
	alreadyInstalled: boolean;
	cacheHit: boolean;
	source: InstallSource;
}

async function prepareAllInstallations(
	plan: InstallPlanItem[],
	cacheEnabled: boolean,
): Promise<PreparedInstallation[]> {
	const tasks = plan.map((item) =>
		prepareInstallation({
			version: item.version,
			type: item.type,
			cacheEnabled,
		}),
	);
	return Promise.all(tasks);
}

async function copyInstallationsSequentially(
	prepared: PreparedInstallation[],
	installDir: string,
	type: DotnetType,
): Promise<InstallationResult[]> {
	const filtered = prepared.filter((p) => p.type === type);
	const results: InstallationResult[] = [];

	for (const prep of filtered) {
		const result = await copyInstallation(prep, installDir);
		results.push(result);
	}

	return results;
}

async function copyWindowsInstallations(
	prepared: PreparedInstallation[],
	installDir: string,
): Promise<InstallationResult[]> {
	const sdkResults = await copyInstallationsSequentially(
		prepared,
		installDir,
		'sdk',
	);
	const aspnetcoreResults = await copyInstallationsSequentially(
		prepared,
		installDir,
		'aspnetcore',
	);
	const runtimeResults = await copyInstallationsSequentially(
		prepared,
		installDir,
		'runtime',
	);

	return [...sdkResults, ...aspnetcoreResults, ...runtimeResults];
}

async function copyNonWindowsInstallations(
	prepared: PreparedInstallation[],
	installDir: string,
): Promise<InstallationResult[]> {
	const tasks = prepared.map((prep) => copyInstallation(prep, installDir));
	return Promise.all(tasks);
}

async function copyInstallationsToDirectory(
	prepared: PreparedInstallation[],
	installDir: string,
): Promise<InstallationResult[]> {
	const platform = getPlatform();

	return platform === 'win'
		? copyWindowsInstallations(prepared, installDir)
		: copyNonWindowsInstallations(prepared, installDir);
}

async function ensureDotnetBinary(
	prepared: PreparedInstallation[],
	installDir: string,
): Promise<void> {
	const hasSdk = prepared.some((p) => p.type === 'sdk');
	if (hasSdk) return;

	const firstRuntime = prepared.find(
		(p) => p.type === 'runtime' || p.type === 'aspnetcore',
	);

	if (firstRuntime && !firstRuntime.alreadyInstalled) {
		const platform = getPlatform();
		const prefix = `[${firstRuntime.type.toUpperCase()}]`;
		await copyDotnetBinary(
			firstRuntime.extractedPath,
			installDir,
			platform,
			prefix,
		);
	}
}

async function executeInstallPlan(
	plan: InstallPlanItem[],
	cacheEnabled: boolean,
): Promise<InstallationResult[]> {
	const startTime = Date.now();

	const prepared = await prepareAllInstallations(plan, cacheEnabled);
	const installDir = getDotNetInstallDirectory();
	const results = await copyInstallationsToDirectory(prepared, installDir);

	await ensureDotnetBinary(prepared, installDir);
	configureEnvironment(installDir);

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${duration}s`);

	return results;
}

function getCacheHitStatusFromResults(
	installations: InstallationResult[],
): CacheHitStatus {
	if (installations.length === 0) {
		return 'false';
	}

	const cacheHitCount = installations.filter((i) => i.cacheHit).length;

	if (cacheHitCount === installations.length) {
		return 'true';
	}
	if (cacheHitCount > 0) {
		return 'partial';
	}
	return 'false';
}

function sortByType(installations: InstallationResult[]): InstallationResult[] {
	const typeOrder: Record<DotnetType, number> = {
		sdk: 0,
		runtime: 1,
		aspnetcore: 2,
	};
	return [...installations].sort(
		(a, b) => typeOrder[a.type] - typeOrder[b.type],
	);
}

function formatVersion(type: DotnetType, version: string): string {
	const typeLabel = formatTypeLabel(type);
	return `${typeLabel} ${version}`;
}

interface InstallationsBySource {
	alreadyInstalled: InstallationResult[];
	localCache: InstallationResult[];
	githubCache: InstallationResult[];
	downloaded: InstallationResult[];
}

function groupInstallationsBySource(
	installations: InstallationResult[],
): InstallationsBySource {
	return {
		alreadyInstalled: installations.filter(
			(i) => i.source === 'installation-directory',
		),
		localCache: installations.filter((i) => i.source === 'local-cache'),
		githubCache: installations.filter((i) => i.source === 'github-cache'),
		downloaded: installations.filter((i) => i.source === 'download'),
	};
}

function formatVersionsList(installations: InstallationResult[]): string {
	return sortByType(installations)
		.map((i) => formatVersion(i.type, i.version))
		.join(' | ');
}

function logInstallationsBySource(grouped: InstallationsBySource): void {
	const sources: Array<[string, InstallationResult[]]> = [
		['Already installed', grouped.alreadyInstalled],
		['Restored from local cache', grouped.localCache],
		['Restored from GitHub Actions cache', grouped.githubCache],
		['Downloaded', grouped.downloaded],
	];

	for (const [label, installations] of sources) {
		if (installations.length > 0) {
			core.info(`${label}: ${formatVersionsList(installations)}`);
		}
	}
}

function setOutputsFromInstallations(
	installations: InstallationResult[],
): void {
	const versions = installations
		.map((i) => `${i.type}:${i.version}`)
		.join(', ');
	const installDir = getDotNetInstallDirectory();
	const cacheHit = getCacheHitStatusFromResults(installations);

	setActionOutputs(versions, installDir, cacheHit);

	const grouped = groupInstallationsBySource(installations);
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

		const plan = buildInstallPlan(deduplicated);
		core.info(`Installing: ${formatVersionPlan(deduplicated)}`);

		const installations = await executeInstallPlan(plan, inputs.cacheEnabled);
		setOutputsFromInstallations(installations);
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unknown error occurred');
		}
	}
}

await run();
