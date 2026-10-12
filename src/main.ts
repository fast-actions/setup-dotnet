import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	configureEnvironment,
	ensureDotnetBinary,
	getDotnetInstallDirectory,
	installVersion,
} from './installer';
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
import { getDotnetBinaryName, getPlatform } from './utils/platform-utils';
import { deduplicateVersions } from './utils/versioning/version-deduplicator';
import { fetchAndCacheReleaseInfo } from './utils/versioning/version-resolver';

const DOTNET_TYPES: DotnetType[] = ['sdk', 'runtime', 'aspnetcore'];
const WINDOWS_INSTALL_ORDER: DotnetType[] = ['sdk', 'aspnetcore', 'runtime'];

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
	inToolCacheTarget: boolean;
}

async function areAllVersionsInstalled(
	deduplicated: VersionSet,
): Promise<AllVersionsInstalledResult> {
	const dotnetPath = path.join(
		getDotnetInstallDirectory(),
		getDotnetBinaryName(),
	);
	const inToolCacheTarget = fs.existsSync(dotnetPath);
	const installed = await getInstalledVersions(
		inToolCacheTarget ? dotnetPath : undefined,
	);

	const allInstalled = DOTNET_TYPES.every((type) =>
		deduplicated[type].every((version) =>
			isVersionInstalled(version, type, installed),
		),
	);

	return { allInstalled, inToolCacheTarget };
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
	return {
		sdk: await resolveSdkVersions(inputs),
		runtime: {
			versions: parseVersions(inputs.runtimeInput),
			allowPrerelease: inputs.allowPreview,
		},
		aspnetcore: {
			versions: parseVersions(inputs.aspnetcoreInput),
			allowPrerelease: inputs.allowPreview,
		},
	};
}

function ensureRequestedVersions(versionSet: VersionSetWithPrerelease): void {
	if (DOTNET_TYPES.every((type) => versionSet[type].versions.length === 0)) {
		throw new Error(
			'At least one of sdk-version, runtime-version, or aspnetcore-version must be specified',
		);
	}
}

function buildVersionEntries(deduplicated: VersionSet): VersionEntry[] {
	return DOTNET_TYPES.flatMap((type) =>
		deduplicated[type].map((version) => ({ version, type })),
	);
}

async function installVersionsSequentially(
	entries: VersionEntry[],
): Promise<InstallResult[]> {
	const results: InstallResult[] = [];

	for (const type of WINDOWS_INSTALL_ORDER) {
		for (const entry of entries.filter(
			(candidate) => candidate.type === type,
		)) {
			results.push(await installVersion(entry));
		}
	}

	return results;
}

async function installAllVersions(
	entries: VersionEntry[],
): Promise<InstallResult[]> {
	if (getPlatform() === 'win') {
		return installVersionsSequentially(entries);
	}

	return Promise.all(entries.map((entry) => installVersion(entry)));
}

async function executeInstallPlan(
	entries: VersionEntry[],
	cacheEnabled: boolean,
): Promise<InstallResult[]> {
	const startTime = Date.now();

	const cacheRestored = cacheEnabled && (await restoreUnifiedCache(entries));

	const results = await installAllVersions(entries);

	await ensureDotnetBinary(results);

	configureEnvironment(true);

	if (cacheEnabled && !cacheRestored && getPlatform() !== 'win') {
		await saveUnifiedCache(entries);
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${duration}s`);

	return results;
}

function isCacheHit(results: InstallResult[]): boolean {
	return (
		results.length > 0 &&
		results.every((result) => result.source === 'github-cache')
	);
}

function setOutputsFromInstallations(results: InstallResult[]): void {
	const versions = results
		.map((result) => `${result.type}:${result.version}`)
		.join(', ');

	setActionOutputs(versions, getDotnetInstallDirectory(), isCacheHit(results));
	logInstallationsBySource(groupInstallationsBySource(results));
}

export async function run(): Promise<void> {
	try {
		const inputs = readInputs();
		const requestedVersions = await resolveRequestedVersions(inputs);

		ensureRequestedVersions(requestedVersions);
		await fetchAndCacheReleaseInfo();

		const deduplicated = await deduplicateVersions(requestedVersions);

		const { allInstalled, inToolCacheTarget } =
			await areAllVersionsInstalled(deduplicated);
		if (allInstalled) {
			core.info(
				'✅ All requested versions are already installed on the system',
			);
			configureEnvironment(inToolCacheTarget);
			return;
		}

		core.info(`Installing: ${formatVersionPlan(deduplicated)}`);

		const results = await executeInstallPlan(
			buildVersionEntries(deduplicated),
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
