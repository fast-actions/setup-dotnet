import * as core from '@actions/core';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as path from 'node:path';
import { extractArchive } from './utils/archive-utils';
import { getArchitecture, getPlatform } from './utils/platform-utils';
import { resolveVersion } from './utils/version-resolver';

// Shared installation directory for all .NET installations
let dotnetInstallDir: string | null = null;

export interface InstallOptions {
	version: string;
	type: 'sdk' | 'runtime';
}

export interface InstallResult {
	version: string;
	type: 'sdk' | 'runtime';
	path: string;
}

/**
 * Get or create the shared .NET installation directory
 */
function getDotNetInstallDirectory(): string {
	if (!dotnetInstallDir) {
		// Use RUNNER_TEMP as base directory (cleaned up after job)
		const runnerTemp = process.env.RUNNER_TEMP || '/tmp';
		dotnetInstallDir = path.join(runnerTemp, 'dotnet');
		core.debug(`Shared .NET installation directory: ${dotnetInstallDir}`);
	}
	return dotnetInstallDir;
}

/**
 * Install .NET SDK or Runtime
 */
export async function installDotNet(
	options: InstallOptions,
): Promise<InstallResult> {
	const { version, type } = options;

	core.debug(`installDotNet called with: version='${version}', type='${type}'`);

	// Resolve wildcard versions to concrete version
	core.debug(`Resolving version: ${version}`);
	const resolvedVersion = await resolveVersion(version, type);
	core.info(`Resolved version: ${resolvedVersion}`);

	// Download and install
	core.info(`Downloading .NET ${type} ${resolvedVersion}...`);
	const platform = getPlatform();
	const arch = getArchitecture();
	core.debug(`Platform: ${platform}, Architecture: ${arch}`);
	const downloadUrl = getDotNetDownloadUrl(resolvedVersion, type);
	core.debug(`Download URL: ${downloadUrl}`);

	core.debug('Starting download...');
	let downloadPath: string;
	try {
		downloadPath = await downloadWithRetry(downloadUrl, 3);
		core.debug(`Downloaded to: ${downloadPath}`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.error(`Download failed after retries: ${errorMsg}`);
		core.debug(`Full error details: ${JSON.stringify(error)}`);
		throw new Error(
			`Failed to download .NET ${type} ${resolvedVersion} from ${downloadUrl}: ${errorMsg}`,
		);
	}

	// Extract archive
	core.info('Extracting archive...');
	core.debug(`Extracting archive from: ${downloadPath}`);
	const ext = platform === 'win' ? 'zip' : 'tar.gz';
	const extractedPath = await extractArchive(downloadPath, ext);
	core.debug(`Extracted to: ${extractedPath}`);

	// Get shared installation directory
	const installDir = getDotNetInstallDirectory();

	// Copy extracted files to shared directory
	core.debug(`Copying to shared directory: ${installDir}`);
	await io.mkdirP(installDir);
	await io.cp(extractedPath, installDir, { recursive: true, force: false });
	core.debug(`Copied to: ${installDir}`);

	// Set DOTNET_ROOT so dotnet finds our installation
	if (!process.env.DOTNET_ROOT) {
		core.debug(`Setting DOTNET_ROOT: ${installDir}`);
		core.exportVariable('DOTNET_ROOT', installDir);
		core.info('Set DOTNET_ROOT');
	} else {
		core.debug('DOTNET_ROOT already set');
	}

	// Disable multi-level lookup to prevent finding system-wide .NET
	if (!process.env.DOTNET_MULTILEVEL_LOOKUP) {
		core.debug('Setting DOTNET_MULTILEVEL_LOOKUP=0');
		core.exportVariable('DOTNET_MULTILEVEL_LOOKUP', '0');
		core.info('Disabled multi-level lookup');
	}

	// Add to PATH at the BEGINNING to override system dotnet
	if (!process.env.PATH?.includes(installDir)) {
		core.debug(`Prepending to PATH: ${installDir}`);
		core.addPath(installDir);
		core.info('Added to PATH');
	} else {
		core.debug('Shared directory already in PATH');
	}

	return {
		version: resolvedVersion,
		type,
		path: installDir,
	};
}

/**
 * Get the download URL for .NET
 */
export function getDotNetDownloadUrl(
	version: string,
	type: 'sdk' | 'runtime',
): string {
	const platform = getPlatform();
	const arch = getArchitecture();
	const ext = platform === 'win' ? 'zip' : 'tar.gz';

	const typeCapitalized = type === 'sdk' ? 'Sdk' : 'Runtime';
	const packageName = type === 'sdk' ? 'sdk' : 'runtime';

	return `https://builds.dotnet.microsoft.com/dotnet/${typeCapitalized}/${version}/dotnet-${packageName}-${version}-${platform}-${arch}.${ext}`;
}

/**
 * Download with retry logic
 */
async function downloadWithRetry(
	url: string,
	maxRetries: number,
): Promise<string> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			core.debug(`Download attempt ${attempt}/${maxRetries}`);
			const downloadPath = await toolCache.downloadTool(url);
			core.debug(`Download successful on attempt ${attempt}`);
			return downloadPath;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			core.warning(
				`Download attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
			);

			if (attempt < maxRetries) {
				const waitTime = attempt * 5;
				core.info(`Waiting ${waitTime} seconds before retry...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
			}
		}
	}

	throw lastError || new Error('Download failed for unknown reason');
}
