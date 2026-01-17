import * as core from '@actions/core';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DotnetType } from './types';
import { extractArchive } from './utils/archive-utils';
import { getArchitecture, getPlatform } from './utils/platform-utils';

// Shared installation directory for all .NET installations
let dotnetInstallDir: string | null = null;

export interface InstallOptions {
	version: string;
	type: DotnetType;
}

export interface InstallResult {
	version: string;
	type: DotnetType;
	path: string;
}

/**
 * Get or create the shared .NET installation directory
 */
export function getDotNetInstallDirectory(): string {
	if (!dotnetInstallDir) {
		const toolCache =
			process.env.AGENT_TOOLSDIRECTORY || process.env.RUNNER_TOOL_CACHE;
		if (!toolCache) {
			throw new Error(
				'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set. ',
			);
		}
		dotnetInstallDir = path.join(toolCache, 'dotnet');
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
	const prefix = `[${type.toUpperCase()}]`;

	core.info(`${prefix} Installing ${version}`);

	const downloadUrl = getDotNetDownloadUrl(version, type);
	core.debug(`${prefix} Download URL: ${downloadUrl}`);

	core.info(`${prefix} Downloading...`);
	let downloadPath: string;
	try {
		downloadPath = await downloadWithRetry(downloadUrl, 3);

		// Validate download
		const stats = fs.statSync(downloadPath);
		if (stats.size === 0) {
			throw new Error('Downloaded file is empty');
		}

		const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
		core.info(`${prefix} Downloaded ${sizeInMB} MB`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		const platform = getPlatform();
		const arch = getArchitecture();
		throw new Error(
			`Failed to download .NET ${type} ${version} (${platform}-${arch}): ${errorMsg}`,
		);
	}

	core.info(`${prefix} Extracting...`);
	const platform = getPlatform();
	const ext = platform === 'win' ? 'zip' : 'tar.gz';
	let extractedPath: string;
	try {
		extractedPath = await extractArchive(downloadPath, ext);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to extract archive: ${errorMsg}`);
	}

	// Validate extracted dotnet binary exists
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(extractedPath, dotnetBinary);
	if (!fs.existsSync(dotnetPath)) {
		throw new Error(
			`Extracted archive is missing ${dotnetBinary}. Archive may be corrupted.`,
		);
	}

	const installDir = getDotNetInstallDirectory();
	core.info(`${prefix} Installing...`);
	await io.mkdirP(installDir);
	try {
		await io.cp(extractedPath, installDir, {
			recursive: true,
			copySourceDirectory: false,
		});
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to copy files to ${installDir}: ${errorMsg}`);
	}

	if (!process.env.PATH?.includes(installDir)) {
		core.addPath(installDir);
	}

	core.exportVariable('DOTNET_ROOT', installDir);

	return {
		version: version,
		type,
		path: installDir,
	};
}

/**
 * Get the download URL for .NET
 */
export function getDotNetDownloadUrl(
	version: string,
	type: DotnetType,
): string {
	const platform = getPlatform();
	const arch = getArchitecture();
	const ext = platform === 'win' ? 'zip' : 'tar.gz';

	if (type === 'aspnetcore') {
		return `https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/${version}/aspnetcore-runtime-${version}-${platform}-${arch}.${ext}`;
	}

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
