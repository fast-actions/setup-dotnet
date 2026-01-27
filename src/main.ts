import * as core from '@actions/core';
import { getDotNetInstallDirectory, installDotNet } from './installer';
import type {
	DotnetType,
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
import { fetchAndCacheReleaseInfo } from './utils/versioning/version-resolver';

interface InstallationResult {
	version: string;
	type: DotnetType;
	path: string;
	cacheHit: boolean;
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
 * Set GitHub Action outputs
 */
function setActionOutputs(
	versions: string,
	installDir: string,
	cacheHit: CacheHitStatus,
): void {
	core.setOutput('dotnet-version', versions);
	core.setOutput('dotnet-path', installDir);
	core.setOutput('cache-hit', cacheHit);
}

/**
 * Check if ALL requested versions are already installed on the system
 */
async function areAllVersionsInstalled(
	deduplicated: VersionSet,
): Promise<boolean> {
	const installed = await getInstalledVersions();

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
	const installTasks = plan.map((item) =>
		installDotNet({
			version: item.version,
			type: item.type,
			cacheEnabled,
		}),
	);

	const installStartTime = Date.now();
	const installations = await Promise.all(installTasks);
	const installDuration = ((Date.now() - installStartTime) / 1000).toFixed(2);
	core.info(`✅ Installation complete in ${installDuration}s`);

	return installations;
}

/**
 * Determine cache hit status from installation results
 */
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

function setOutputsFromInstallations(
	installations: InstallationResult[],
): void {
	const versions = installations
		.map((i) => `${i.type}:${i.version}`)
		.join(', ');
	const installDir = getDotNetInstallDirectory();
	const cacheHit = getCacheHitStatusFromResults(installations);

	setActionOutputs(versions, installDir, cacheHit);

	// Log cache status summary
	const cachedVersions = installations.filter((i) => i.cacheHit);
	const downloadedVersions = installations.filter((i) => !i.cacheHit);

	if (cachedVersions.length > 0) {
		core.info(
			`📦 Restored from cache: ${cachedVersions.map((i) => `${i.type}:${i.version}`).join(', ')}`,
		);
	}
	if (downloadedVersions.length > 0) {
		core.info(
			`⬇️ Downloaded: ${downloadedVersions.map((i) => `${i.type}:${i.version}`).join(', ')}`,
		);
	}
}

/**
 * Main entry point for the GitHub Action
 */
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
