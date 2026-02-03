import * as core from '@actions/core';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DotnetType, FileInfo, Release } from './types';
import type {
	DownloadInfo,
	InstallOptions,
	InstallResult,
} from './installer.types';

export type { DownloadInfo, InstallOptions, InstallResult };
import { getVersionCachePath } from './utils/cache-utils';
import {
	getInstalledVersions,
	isVersionInstalled,
} from './utils/dotnet-detector';
import { getArchitecture, getPlatform } from './utils/platform-utils';
import { fetchReleaseManifest } from './utils/versioning/release-cache';

// Shared installation directory for all .NET installations
let dotnetInstallDir: string | null = null;

function validateDownloadedFile(downloadPath: string, prefix: string): void {
	const stats = fs.statSync(downloadPath);
	if (stats.size === 0) {
		throw new Error('Downloaded file is empty');
	}
	if (core.isDebug()) {
		const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
		core.debug(`${prefix} Downloaded ${sizeInMB} MB`);
	}
}

function validateFileHash(
	filePath: string,
	expectedHash: string,
	prefix: string,
): void {
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

async function copySdkToInstallDir(
	extractedPath: string,
	installDir: string,
	prefix: string,
): Promise<void> {
	core.debug(`${prefix} Copying SDK to install directory...`);
	await io.mkdirP(installDir);
	try {
		await io.cp(extractedPath, installDir, {
			recursive: true,
			copySourceDirectory: false,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy SDK files to ${installDir}: ${errorMessage}`,
		);
	}
}

async function copyRuntimeToInstallDir(
	extractedPath: string,
	installDir: string,
	prefix: string,
): Promise<void> {
	core.debug(
		`${prefix} Copying runtime (host and shared folders) to install directory...`,
	);
	await io.mkdirP(installDir);

	const hostSource = path.join(extractedPath, 'host');
	const sharedSource = path.join(extractedPath, 'shared');
	const hostDest = path.join(installDir, 'host');
	const sharedDest = path.join(installDir, 'shared');

	const copyTasks: Promise<void>[] = [];

	if (fs.existsSync(hostSource)) {
		copyTasks.push(
			io.cp(hostSource, hostDest, {
				recursive: true,
				copySourceDirectory: false,
			}),
		);
	}

	if (fs.existsSync(sharedSource)) {
		copyTasks.push(
			io.cp(sharedSource, sharedDest, {
				recursive: true,
				copySourceDirectory: false,
			}),
		);
	}

	if (copyTasks.length === 0) {
		core.warning(`${prefix} No host or shared folders found in extracted path`);
		return;
	}

	try {
		await Promise.all(copyTasks);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy runtime files to ${installDir}: ${errorMessage}`,
		);
	}
}

export async function copyDotnetBinary(
	extractedPath: string,
	installDir: string,
	platform: string,
	prefix: string,
): Promise<void> {
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const sourcePath = path.join(extractedPath, dotnetBinary);
	const destPath = path.join(installDir, dotnetBinary);

	if (!fs.existsSync(sourcePath)) {
		throw new Error(`dotnet binary not found in extracted path: ${sourcePath}`);
	}

	if (fs.existsSync(destPath)) {
		core.debug(`${prefix} dotnet binary already exists, skipping copy`);
		return;
	}

	core.debug(`${prefix} Copying dotnet binary to install directory...`);
	await io.mkdirP(installDir);
	try {
		await io.cp(sourcePath, destPath, { recursive: false });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy dotnet binary to ${installDir}: ${errorMessage}`,
		);
	}
}

export function configureEnvironment(installDir: string): void {
	if (!process.env.PATH?.includes(installDir)) {
		core.addPath(installDir);
	}

	if (!process.env.DOTNET_ROOT?.includes(installDir)) {
		core.exportVariable('DOTNET_ROOT', installDir);
	}

	if (!process.env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE) {
		core.exportVariable('DOTNET_SKIP_FIRST_TIME_EXPERIENCE', '1');
	}

	if (!process.env.DOTNET_NOLOGO) {
		core.exportVariable('DOTNET_NOLOGO', '1');
	}
}

function getToolCacheDirectory(): string {
	const toolCacheDir =
		process.env.AGENT_TOOLSDIRECTORY || process.env.RUNNER_TOOL_CACHE;
	if (!toolCacheDir) {
		throw new Error(
			'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set.',
		);
	}
	return toolCacheDir;
}

export function getDotNetInstallDirectory(): string {
	if (!dotnetInstallDir) {
		dotnetInstallDir = path.join(getToolCacheDirectory(), 'dotnet');
	}
	return dotnetInstallDir;
}

export function isVersionInCache(version: string, type: DotnetType): boolean {
	const cachePath = getVersionCachePath(version, type);
	const platform = getPlatform();
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(cachePath, dotnetBinary);
	return fs.existsSync(dotnetPath);
}

async function isVersionInstalledInDirectory(
	installDir: string,
	version: string,
	type: DotnetType,
): Promise<boolean> {
	const platform = getPlatform();
	const dotnetBinary = platform === 'win' ? 'dotnet.exe' : 'dotnet';
	const dotnetPath = path.join(installDir, dotnetBinary);

	// First check if dotnet binary exists in install directory
	if (!fs.existsSync(dotnetPath)) {
		return false;
	}

	// Use dotnet-detector to check installed versions
	try {
		const installed = await getInstalledVersions(dotnetPath);
		return isVersionInstalled(version, type, installed);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.debug(
			`Error checking installed versions in ${installDir}: ${errorMessage}`,
		);
		return false;
	}
}

export async function installVersion(
	options: InstallOptions,
): Promise<InstallResult> {
	const { version, type } = options;
	const prefix = `[${type.toUpperCase()}]`;
	const platform = getPlatform();
	const installDir = getDotNetInstallDirectory();
	const cachePath = getVersionCachePath(version, type);

	core.debug(`${prefix} Installing ${version}`);

	if (await isVersionInstalledInDirectory(installDir, version, type)) {
		core.debug(`${prefix} Already installed in: ${installDir}`);
		return {
			version,
			type,
			path: installDir,
			source: 'installation-directory',
		};
	}

	if (isVersionInCache(version, type)) {
		core.debug(`${prefix} Found in cache: ${cachePath}`);
		validateExtractedBinary(cachePath, platform);

		if (type === 'sdk') {
			await copySdkToInstallDir(cachePath, installDir, prefix);
		} else {
			await copyRuntimeToInstallDir(cachePath, installDir, prefix);
		}

		return {
			version,
			type,
			path: installDir,
			source: 'github-cache',
		};
	}

	core.debug(`${prefix} Downloading ${version}`);
	const { url, hash } = await getDotNetDownloadInfo(version, type);
	const downloadPath = await downloadDotnetArchive(url, hash, prefix);

	await io.mkdirP(cachePath);
	core.debug(`${prefix} Extracting to cache: ${cachePath}`);

	const extractedPath =
		platform === 'win'
			? await toolCache.extractZip(downloadPath, cachePath)
			: await toolCache.extractTar(downloadPath, cachePath);

	validateExtractedBinary(extractedPath, platform);

	if (type === 'sdk') {
		await copySdkToInstallDir(extractedPath, installDir, prefix);
	} else {
		await copyRuntimeToInstallDir(extractedPath, installDir, prefix);
	}

	return {
		version,
		type,
		path: installDir,
		source: 'download',
	};
}

export async function getDotNetDownloadInfo(
	version: string,
	type: DotnetType,
): Promise<DownloadInfo> {
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

	return { url: file.url, hash: file.hash };
}

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
