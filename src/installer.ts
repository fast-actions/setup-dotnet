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
		const toolCache = process.env.RUNNER_TOOL_CACHE || '/opt/hostedtoolcache';
		dotnetInstallDir = path.join(toolCache, 'dotnet-custom');
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

	const resolvedVersion = await resolveVersion(version, type);
	core.info(`Resolved version: ${resolvedVersion}`);

	core.info(`Downloading .NET ${type} ${resolvedVersion}...`);
	const platform = getPlatform();
	const arch = getArchitecture();
	core.debug(`Platform: ${platform}, Architecture: ${arch}`);
	const downloadUrl = getDotNetDownloadUrl(resolvedVersion, type);
	core.debug(`Download URL: ${downloadUrl}`);

	let downloadPath: string;
	try {
		downloadPath = await downloadWithRetry(downloadUrl, 3);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to download .NET ${type} ${resolvedVersion}: ${errorMsg}`,
		);
	}

	core.info('Extracting archive...');
	const ext = platform === 'win' ? 'zip' : 'tar.gz';
	const extractedPath = await extractArchive(downloadPath, ext);

	const installDir = getDotNetInstallDirectory();
	core.info(`Installing to ${installDir}...`);
	await io.mkdirP(installDir);
	await io.cp(extractedPath, installDir, {
		recursive: true,
		force: true,
		copySourceDirectory: false,
	});

	if (!process.env.PATH?.includes(installDir)) {
		core.addPath(installDir);
	}

	core.exportVariable('DOTNET_ROOT', installDir);
	core.exportVariable('DOTNET_MULTILEVEL_LOOKUP', '0');

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
			return await toolCache.downloadTool(url);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < maxRetries) {
				const waitTime = attempt * 5;
				core.warning(`Download failed, retrying in ${waitTime}s...`);
				await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
			}
		}
	}

	throw lastError || new Error('Download failed for unknown reason');
}
