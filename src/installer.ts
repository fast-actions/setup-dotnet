import * as core from '@actions/core';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DotnetType, FileInfo, Release } from './types';
import { extractArchive } from './utils/archive-utils';
import { getArchitecture, getPlatform } from './utils/platform-utils';
import { fetchReleaseManifest } from './utils/versioning/release-cache';

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
 * Ensure the downloaded file exists and is non-empty
 */
function validateDownloadedFile(downloadPath: string, prefix: string): void {
	const stats = fs.statSync(downloadPath);
	if (stats.size === 0) {
		throw new Error('Downloaded file is empty');
	}

	const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
	core.info(`${prefix} Downloaded ${sizeInMB} MB`);
}

/**
 * Validate file hash (SHA512)
 */
function validateFileHash(
	filePath: string,
	expectedHash: string,
	prefix: string,
): void {
	core.debug(`${prefix} Validating hash...`);
	const fileBuffer = fs.readFileSync(filePath);
	const actualHash = crypto
		.createHash('sha512')
		.update(fileBuffer)
		.digest('hex')
		.toLowerCase();

	const expectedHashLower = expectedHash.toLowerCase();

	if (actualHash !== expectedHashLower) {
		throw new Error(
			`Hash mismatch! Expected: ${expectedHashLower.substring(0, 16)}..., Got: ${actualHash.substring(0, 16)}... File may be corrupted or tampered.`,
		);
	}

	core.debug(`${prefix} Hash validated successfully`);
}

async function downloadDotnetArchive(
	downloadUrl: string,
	expectedHash: string,
	prefix: string,
): Promise<string> {
	core.debug(`${prefix} Download URL: ${downloadUrl}`);

	try {
		const downloadPath = await downloadWithRetry(downloadUrl, 3);
		validateDownloadedFile(downloadPath, prefix);
		validateFileHash(downloadPath, expectedHash, prefix);
		return downloadPath;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to download from ${downloadUrl}: ${errorMessage}`);
	}
}

async function extractDotnetArchive(
	downloadPath: string,
	platform: string,
	prefix: string,
): Promise<string> {
	core.info(`${prefix} Extracting...`);
	const extensions = platform === 'win' ? 'zip' : 'tar.gz';
	try {
		return await extractArchive(downloadPath, extensions);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to extract archive: ${errorMessage}`);
	}
}

function validateExtractedBinary(
	extractedPath: string,
	platform: string,
): string {
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(extractedPath, dotnetBinary);
	if (!fs.existsSync(dotnetPath)) {
		throw new Error(
			`Extracted archive is missing ${dotnetBinary}. Archive may be corrupted.`,
		);
	}
	return dotnetPath;
}

async function copyToInstallDir(
	extractedPath: string,
	installDir: string,
	prefix: string,
): Promise<void> {
	core.info(`${prefix} Installing...`);
	await io.mkdirP(installDir);
	try {
		await io.cp(extractedPath, installDir, {
			recursive: true,
			copySourceDirectory: false,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to copy files to ${installDir}: ${errorMessage}`);
	}
}

function configureEnvironment(installDir: string): void {
	if (!process.env.PATH?.includes(installDir)) {
		core.addPath(installDir);
	}

	core.exportVariable('DOTNET_ROOT', installDir);
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
	const platform = getPlatform();

	core.info(`${prefix} Installing ${version}`);

	const { url: downloadUrl, hash } = await getDotNetDownloadInfo(version, type);
	const downloadPath = await downloadDotnetArchive(downloadUrl, hash, prefix);

	const extractedPath = await extractDotnetArchive(
		downloadPath,
		platform,
		prefix,
	);
	validateExtractedBinary(extractedPath, platform);

	const installDir = getDotNetInstallDirectory();
	await copyToInstallDir(extractedPath, installDir, prefix);
	configureEnvironment(installDir);

	return {
		version: version,
		type,
		path: installDir,
	};
}

/**
 * Get download URL and hash from releases API
 */
export async function getDotNetDownloadInfo(
	version: string,
	type: DotnetType,
): Promise<{ url: string; hash: string }> {
	const platform = getPlatform();
	const architecture = getArchitecture();
	const extension = platform === 'win' ? 'zip' : 'tar.gz';

	// Build RID (Runtime Identifier)
	const rid = `${platform}-${architecture}`;

	// Fetch manifest
	const manifest = await fetchReleaseManifest(version);

	// Find the release matching our version
	const release = manifest.releases.find((r) => {
		if (type === 'sdk') {
			return r.sdks?.some((s) => s.version === version);
		}
		if (type === 'aspnetcore') {
			return r['aspnetcore-runtime']?.version === version;
		}
		return r.runtime?.version === version;
	});

	if (!release) {
		throw new Error(
			`Version ${version} not found in releases manifest for ${type}`,
		);
	}

	// Get the appropriate section
	const section = getSectionFromRelease(release, version, type);

	if (!section?.files) {
		throw new Error(`No files found for ${type} version ${version}`);
	}

	// Build expected filename pattern
	const filePattern = getExpectedFileName(type, rid, extension);

	// Find matching file
	const file = section.files.find(
		(f) => f.name === filePattern && f.rid === rid,
	);

	if (!file) {
		throw new Error(
			`Download not found for ${type} ${version} on ${rid}. Expected file: ${filePattern}`,
		);
	}

	if (!file.hash) {
		throw new Error(
			`Hash missing for ${type} ${version} on ${rid}. Cannot validate download integrity.`,
		);
	}

	core.debug(`Found download: ${file.url}`);
	core.debug(`Expected hash: ${file.hash.substring(0, 16)}...`);

	return { url: file.url, hash: file.hash };
}

/**
 * Get the appropriate section from a release entry based on type and version
 */
function getSectionFromRelease(
	release: Release,
	version: string,
	type: DotnetType,
): { version: string; files?: FileInfo[] } | undefined {
	if (type === 'sdk') {
		return release.sdks?.find((s) => s.version === version);
	}
	if (type === 'aspnetcore') {
		return release['aspnetcore-runtime'];
	}
	return release.runtime;
}

/**
 * Get the expected filename pattern for download
 */
function getExpectedFileName(
	type: DotnetType,
	rid: string,
	extension: string,
): string {
	if (type === 'aspnetcore') {
		return `aspnetcore-runtime-${rid}.${extension}`;
	}
	if (type === 'sdk') {
		return `dotnet-sdk-${rid}.${extension}`;
	}
	return `dotnet-runtime-${rid}.${extension}`;
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
