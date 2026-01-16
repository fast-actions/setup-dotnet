import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as toolCache from '@actions/tool-cache';
import { setupCache } from './cache';
import { extractArchive } from './utils/archive-utils';
import { getArchitecture, getPlatform } from './utils/platform-utils';
import { resolveVersion } from './utils/version-resolver';

export interface InstallOptions {
	version: string;
	type: 'sdk' | 'runtime';
	enableCache: boolean;
}

export interface InstallResult {
	version: string;
	type: 'sdk' | 'runtime';
	path: string;
	cacheHit: boolean;
}

/**
 * Install .NET SDK or Runtime
 */
export async function installDotNet(
	options: InstallOptions,
): Promise<InstallResult> {
	const { version, type, enableCache } = options;

	core.debug(
		`installDotNet called with: version='${version}', type='${type}', enableCache=${enableCache}`,
	);

	// Resolve wildcard versions to concrete version
	core.debug(`Resolving version: ${version}`);
	const resolvedVersion = await resolveVersion(version, type);
	core.info(`Resolved version: ${resolvedVersion}`);

	// Try to restore from cache
	const cacheHit = false;
	if (enableCache) {
		core.debug('Cache is enabled, checking for cached installation');
		const cacheResult = await setupCache(resolvedVersion, type);
		if (cacheResult.hit) {
			core.info(`✓ Restored from cache: ${cacheResult.path}`);
			return {
				version: resolvedVersion,
				type,
				path: cacheResult.path,
				cacheHit: true,
			};
		}
	}

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
	const extractedPath = await extractArchive(downloadPath);
	core.debug(`Extracted to: ${extractedPath}`);

	// Cache the installation
	let finalPath = extractedPath;
	if (enableCache) {
		core.info('Caching installation...');
		core.debug(
			`Caching directory: ${extractedPath} with key: dotnet-${type}, version: ${resolvedVersion}`,
		);
		const cachePath = await toolCache.cacheDir(
			extractedPath,
			`dotnet-${type}`,
			resolvedVersion,
		);
		finalPath = cachePath;
		core.debug(`Cached to: ${cachePath}`);
	} else {
		core.debug('Cache disabled, using extracted path directly');
	}

	// Add to PATH
	core.debug(`Adding to PATH: ${finalPath}`);
	core.addPath(finalPath);
	core.info('Added to PATH');

	// Verify installation
	core.debug('Verifying installation...');
	const verified = await verifyDotNetInstallation();
	if (!verified) {
		throw new Error('Failed to verify .NET installation');
	}
	core.info('Installation verified');

	return {
		version: resolvedVersion,
		type,
		path: finalPath,
		cacheHit,
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

/**
 * Verify .NET installation
 */
export async function verifyDotNetInstallation(): Promise<boolean> {
	try {
		let output = '';
		const exitCode = await exec.exec('dotnet', ['--version'], {
			silent: true,
			listeners: {
				stdout: (data: Buffer) => {
					output += data.toString();
				},
			},
		});

		if (exitCode === 0 && output.trim()) {
			core.debug(`Verified .NET version: ${output.trim()}`);
			return true;
		}
		return false;
	} catch (_error) {
		return false;
	}
}
