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
	// First check installation directory if it exists
	const installDir = getDotNetInstallDirectory();
	const platform = getPlatform();
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(installDir, dotnetBinary);

	let installed: Awaited<ReturnType<typeof getInstalledVersions>>;

	if (fs.existsSync(dotnetPath)) {
		// Check installation directory first
		core.debug(`Checking installation directory: ${installDir}`);
		installed = await getInstalledVersions(dotnetPath);
	} else {
		// Fall back to system dotnet
		core.debug('Installation directory not found, checking system dotnet');
		installed = await getInstalledVersions();
	}

	const allSdkInstalled = deduplicated.sdk.every((version) =>
		isVersionInstalled(version, 'sdk', installed),
	);

	const allRuntimeInstalled = deduplicated.runtime.every((version) =>
		isVersionInstalled(version, 'runtime', installed),
	);

	const allAspnetcoreInstalled = deduplicated.aspnetcore.every((version) =>
		isVersionInstalled(version, 'aspnetcore', installed),
	);

	return allSdkInstalled && allRuntimeInstalled && allAspnetcoreInstalled;
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
	core.debug(`Looking for global.json at: ${globalJsonPath}`);

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

async function executeInstallPlan(
	plan: InstallPlanItem[],
	cacheEnabled: boolean,
): Promise<InstallationResult[]> {
	const installStartTime = Date.now();

	// Phase 1: Parallel download/extract for ALL versions
	core.debug(
		'Phase 1: Preparing installations (download/extract) in parallel...',
	);
	const prepareTasks = plan.map((item) =>
		prepareInstallation({
			version: item.version,
			type: item.type,
			cacheEnabled,
		}),
	);

	const prepared = await Promise.all(prepareTasks);
	core.debug(`Phase 1 complete: ${prepared.length} installations prepared`);

	// Phase 2: Copy prepared installations into shared install directory.
	// Windows stays sequential to avoid file locking issues.
	const installDir = getDotNetInstallDirectory();
	const platform = getPlatform();

	let results: InstallationResult[];
	if (platform === 'win') {
		// Sequential copy by type to avoid file locking
		const sequentialResults: InstallationResult[] = [];

		// Copy SDKs first
		const sdks = prepared.filter((p) => p.type === 'sdk');
		if (sdks.length > 0) {
			core.debug(`Phase 2: Copying ${sdks.length} SDK(s) sequentially...`);
			for (const prep of sdks) {
				const result = await copyInstallation(prep, installDir);
				sequentialResults.push(result);
			}
		}

		// Copy ASP.NET Core runtimes second
		const aspnetcores = prepared.filter((p) => p.type === 'aspnetcore');
		if (aspnetcores.length > 0) {
			core.debug(
				`Phase 2: Copying ${aspnetcores.length} ASP.NET Core runtime(s) sequentially...`,
			);
			for (const prep of aspnetcores) {
				const result = await copyInstallation(prep, installDir);
				sequentialResults.push(result);
			}
		}

		// Copy runtimes last
		const runtimes = prepared.filter((p) => p.type === 'runtime');
		if (runtimes.length > 0) {
			core.debug(
				`Phase 2: Copying ${runtimes.length} runtime(s) sequentially...`,
			);
			for (const prep of runtimes) {
				const result = await copyInstallation(prep, installDir);
				sequentialResults.push(result);
			}
		}

		results = sequentialResults;
	} else {
		core.debug(
			`Phase 2: Copying ${prepared.length} installation(s) in parallel (non-Windows)...`,
		);
		const copyTasks = prepared.map((prep) =>
			copyInstallation(prep, installDir),
		);
		results = await Promise.all(copyTasks);
	}

	// Check if we need dotnet binary (no SDK installed)
	const hasSdk = prepared.some((p) => p.type === 'sdk');
	if (!hasSdk) {
		const firstRuntime = prepared.find(
			(p) => p.type === 'runtime' || p.type === 'aspnetcore',
		);
		if (firstRuntime && !firstRuntime.alreadyInstalled) {
			const prefix = `[${firstRuntime.type.toUpperCase()}]`;
			core.debug(
				`No SDK found, copying dotnet binary from ${firstRuntime.type}...`,
			);
			await copyDotnetBinary(
				firstRuntime.extractedPath,
				installDir,
				platform,
				prefix,
			);
		}
	}

	const installDuration = ((Date.now() - installStartTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${installDuration}s`);

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

function setOutputsFromInstallations(
	installations: InstallationResult[],
): void {
	const versions = installations
		.map((i) => `${i.type}:${i.version}`)
		.join(', ');
	const installDir = getDotNetInstallDirectory();
	const cacheHit = getCacheHitStatusFromResults(installations);

	setActionOutputs(versions, installDir, cacheHit);

	// Group installations by source
	const alreadyInstalled = installations.filter(
		(i) => i.source === 'installation-directory',
	);
	const localCache = installations.filter((i) => i.source === 'local-cache');
	const githubCache = installations.filter((i) => i.source === 'github-cache');
	const downloaded = installations.filter((i) => i.source === 'download');

	// Log in order: already installed, cached (local + github), downloaded
	if (alreadyInstalled.length > 0) {
		const sorted = sortByType(alreadyInstalled);
		const versionsList = sorted
			.map((i) => formatVersion(i.type, i.version))
			.join(' | ');
		core.info(`Already installed: ${versionsList}`);
	}

	if (localCache.length > 0) {
		const sorted = sortByType(localCache);
		const versionsList = sorted
			.map((i) => formatVersion(i.type, i.version))
			.join(' | ');
		core.info(`Restored from local cache: ${versionsList}`);
	}

	if (githubCache.length > 0) {
		const sorted = sortByType(githubCache);
		const versionsList = sorted
			.map((i) => formatVersion(i.type, i.version))
			.join(' | ');
		core.info(`Restored from GitHub Actions cache: ${versionsList}`);
	}

	if (downloaded.length > 0) {
		const sorted = sortByType(downloaded);
		const versionsList = sorted
			.map((i) => formatVersion(i.type, i.version))
			.join(' | ');
		core.info(`Downloaded: ${versionsList}`);
	}
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
			// Still configure environment to ensure DOTNET_ROOT is set
			const installDir = getDotNetInstallDirectory();
			configureEnvironment(installDir);
			return;
		}

		// At least one version is missing, so we install the required versions
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

// Run the action
await run();
