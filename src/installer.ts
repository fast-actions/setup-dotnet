import * as core from '@actions/core';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
	DotnetType,
	DownloadInfo,
	InstallResult,
	Release,
	ReleaseComponent,
	VersionEntry,
} from './types';
import { getVersionCachePath } from './utils/cache-utils';
import {
	getInstalledVersions,
	isVersionInstalled,
} from './utils/dotnet-detector';
import {
	getArchitecture,
	getDotnetBinaryName,
	getPlatform,
} from './utils/platform-utils';
import { fetchReleaseManifest } from './utils/versioning/release-cache';

const ARCHIVE_NAME_PREFIXES: Record<DotnetType, string> = {
	sdk: 'dotnet-sdk',
	runtime: 'dotnet-runtime',
	aspnetcore: 'aspnetcore-runtime',
};

const RUNTIME_FOLDERS = ['host', 'shared'];

// Shared installation directory for all .NET installations
let dotnetInstallDirectory: string | null = null;

function getLogPrefix(type: DotnetType): string {
	return `[${type.toUpperCase()}]`;
}

function validateDownloadedFile(downloadPath: string, prefix: string): void {
	const stats = fs.statSync(downloadPath);
	if (stats.size === 0) {
		throw new Error('Downloaded file is empty');
	}
	if (core.isDebug()) {
		const sizeInMegabytes = (stats.size / 1024 / 1024).toFixed(2);
		core.debug(`${prefix} Downloaded ${sizeInMegabytes} MB`);
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

function validateExtractedBinary(extractedPath: string): void {
	const dotnetBinary = getDotnetBinaryName();
	if (!fs.existsSync(path.join(extractedPath, dotnetBinary))) {
		throw new Error(
			`Extracted archive is missing ${dotnetBinary}. Archive may be corrupted.`,
		);
	}
}

async function copySdkToInstallDirectory(
	sourcePath: string,
	installDirectory: string,
	prefix: string,
): Promise<void> {
	core.debug(`${prefix} Copying SDK to install directory...`);
	try {
		await io.cp(sourcePath, installDirectory, {
			recursive: true,
			copySourceDirectory: false,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy SDK files to ${installDirectory}: ${errorMessage}`,
		);
	}
}

async function copyRuntimeToInstallDirectory(
	sourcePath: string,
	installDirectory: string,
	prefix: string,
): Promise<void> {
	core.debug(
		`${prefix} Copying runtime (host and shared folders) to install directory...`,
	);

	const existingFolders = RUNTIME_FOLDERS.filter((folder) =>
		fs.existsSync(path.join(sourcePath, folder)),
	);

	if (existingFolders.length === 0) {
		core.warning(`${prefix} No host or shared folders found in extracted path`);
		return;
	}

	try {
		await Promise.all(
			existingFolders.map((folder) =>
				io.cp(
					path.join(sourcePath, folder),
					path.join(installDirectory, folder),
					{ recursive: true, copySourceDirectory: false },
				),
			),
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy runtime files to ${installDirectory}: ${errorMessage}`,
		);
	}
}

async function copyToInstallDirectory(
	sourcePath: string,
	installDirectory: string,
	type: DotnetType,
): Promise<void> {
	const prefix = getLogPrefix(type);
	await io.mkdirP(installDirectory);

	if (type === 'sdk') {
		await copySdkToInstallDirectory(sourcePath, installDirectory, prefix);
		return;
	}

	await copyRuntimeToInstallDirectory(sourcePath, installDirectory, prefix);
}

async function copyDotnetBinary(
	sourceDirectory: string,
	installDirectory: string,
	prefix: string,
): Promise<void> {
	const dotnetBinary = getDotnetBinaryName();
	const sourcePath = path.join(sourceDirectory, dotnetBinary);
	const destinationPath = path.join(installDirectory, dotnetBinary);

	if (!fs.existsSync(sourcePath)) {
		throw new Error(`dotnet binary not found in extracted path: ${sourcePath}`);
	}

	if (fs.existsSync(destinationPath)) {
		core.debug(`${prefix} dotnet binary already exists, skipping copy`);
		return;
	}

	core.debug(`${prefix} Copying dotnet binary to install directory...`);
	await io.mkdirP(installDirectory);
	try {
		await io.cp(sourcePath, destinationPath, { recursive: false });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to copy dotnet binary to ${installDirectory}: ${errorMessage}`,
		);
	}
}

// Runtime installations only copy the host and shared folders, so without an
// SDK the dotnet binary is taken from the restored runtime in the cache.
export async function ensureDotnetBinary(
	results: InstallResult[],
): Promise<void> {
	if (results.some((result) => result.type === 'sdk')) {
		return;
	}

	const cachedRuntime = results.find(
		(result) => result.source === 'github-cache',
	);
	if (!cachedRuntime) {
		return;
	}

	await copyDotnetBinary(
		getVersionCachePath(cachedRuntime.version, cachedRuntime.type),
		getDotnetInstallDirectory(),
		getLogPrefix(cachedRuntime.type),
	);
}

function getSystemDotnetPath(): string {
	const platform = getPlatform();
	switch (platform) {
		case 'win':
			return path.join('C:', 'Program Files', 'dotnet');
		case 'osx': {
			const home = process.env.HOME;
			if (!home) {
				throw new Error('HOME environment variable is not set.');
			}
			return path.join(home, '.dotnet');
		}
		case 'linux':
			return '/usr/share/dotnet';
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}
}

export function configureEnvironment(useToolCache: boolean): void {
	// Point DOTNET_ROOT/PATH at the tool-cache install when we installed there,
	// otherwise at the pre-existing system installation. DOTNET_ROOT must be set
	// for dotnet tools to resolve the runtime correctly.
	const installDirectory = useToolCache
		? getDotnetInstallDirectory()
		: getSystemDotnetPath();

	if (!process.env.PATH?.includes(installDirectory)) {
		core.addPath(installDirectory);
	}

	if (!process.env.DOTNET_ROOT) {
		core.exportVariable('DOTNET_ROOT', installDirectory);
	}

	if (!process.env.DOTNET_SKIP_FIRST_TIME_EXPERIENCE) {
		core.exportVariable('DOTNET_SKIP_FIRST_TIME_EXPERIENCE', '1');
	}

	if (!process.env.DOTNET_NOLOGO) {
		core.exportVariable('DOTNET_NOLOGO', '1');
	}

	if (!process.env.DOTNET_CLI_TELEMETRY_OPTOUT) {
		core.exportVariable('DOTNET_CLI_TELEMETRY_OPTOUT', '1');
	}

	addDotnetToolsToPath();
}

function addDotnetToolsToPath(): void {
	const home =
		getPlatform() === 'win' ? process.env.USERPROFILE : process.env.HOME;
	if (!home) {
		throw new Error('HOME or USERPROFILE environment variable is not set.');
	}

	const toolsPath = path.join(home, '.dotnet', 'tools');

	if (!process.env.PATH?.includes(toolsPath)) {
		core.addPath(toolsPath);
	}
}

function getToolCacheDirectory(): string {
	const toolCacheDirectory =
		process.env.AGENT_TOOLSDIRECTORY || process.env.RUNNER_TOOL_CACHE;
	if (!toolCacheDirectory) {
		throw new Error(
			'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set.',
		);
	}
	return toolCacheDirectory;
}

export function getDotnetInstallDirectory(): string {
	if (!dotnetInstallDirectory) {
		dotnetInstallDirectory = path.join(getToolCacheDirectory(), 'dotnet');
	}
	return dotnetInstallDirectory;
}

function isVersionInCache(version: string, type: DotnetType): boolean {
	const cachePath = getVersionCachePath(version, type);
	return fs.existsSync(path.join(cachePath, getDotnetBinaryName()));
}

async function isVersionInstalledInDirectory(
	installDirectory: string,
	version: string,
	type: DotnetType,
): Promise<boolean> {
	const dotnetPath = path.join(installDirectory, getDotnetBinaryName());
	if (!fs.existsSync(dotnetPath)) {
		return false;
	}

	const installed = await getInstalledVersions(dotnetPath);
	return isVersionInstalled(version, type, installed);
}

export async function installVersion({
	version,
	type,
}: VersionEntry): Promise<InstallResult> {
	const prefix = getLogPrefix(type);
	const installDirectory = getDotnetInstallDirectory();
	const cachePath = getVersionCachePath(version, type);

	core.debug(`${prefix} Installing ${version}`);

	if (await isVersionInstalledInDirectory(installDirectory, version, type)) {
		core.debug(`${prefix} Already installed in: ${installDirectory}`);
		return {
			version,
			type,
			path: installDirectory,
			source: 'installation-directory',
		};
	}

	if (isVersionInCache(version, type)) {
		core.debug(`${prefix} Found in cache: ${cachePath}`);
		await copyToInstallDirectory(cachePath, installDirectory, type);
		return {
			version,
			type,
			path: installDirectory,
			source: 'github-cache',
		};
	}

	core.debug(`${prefix} Downloading ${version}`);
	const { url, hash } = await getDotnetDownloadInfo(version, type);
	const downloadPath = await downloadDotnetArchive(url, hash, prefix);

	await io.mkdirP(cachePath);
	core.debug(`${prefix} Extracting to cache: ${cachePath}`);

	const extractedPath =
		getPlatform() === 'win'
			? await toolCache.extractZip(downloadPath, cachePath)
			: await toolCache.extractTar(downloadPath, cachePath);

	validateExtractedBinary(extractedPath);
	await copyToInstallDirectory(extractedPath, installDirectory, type);

	return {
		version,
		type,
		path: installDirectory,
		source: 'download',
	};
}

export async function getDotnetDownloadInfo(
	version: string,
	type: DotnetType,
): Promise<DownloadInfo> {
	const platform = getPlatform();
	const runtimeIdentifier = `${platform}-${getArchitecture()}`;
	const extension = platform === 'win' ? 'zip' : 'tar.gz';

	const manifest = await fetchReleaseManifest(version);
	const component = manifest.releases
		.map((release) => getReleaseComponent(release, version, type))
		.find((candidate) => candidate?.version === version);

	if (!component) {
		throw new Error(
			`Version ${version} not found in releases manifest for ${type}`,
		);
	}

	if (!component.files) {
		throw new Error(`No files found for ${type} version ${version}`);
	}

	const fileName = `${ARCHIVE_NAME_PREFIXES[type]}-${runtimeIdentifier}.${extension}`;
	const file = component.files.find(
		(candidate) =>
			candidate.name === fileName && candidate.rid === runtimeIdentifier,
	);

	if (!file) {
		throw new Error(
			`Download not found for ${type} ${version} on ${runtimeIdentifier}. Expected file: ${fileName}`,
		);
	}

	if (!file.hash) {
		throw new Error(
			`Hash missing for ${type} ${version} on ${runtimeIdentifier}. Cannot validate download integrity.`,
		);
	}

	core.debug(`Found download: ${file.url}`);

	return { url: file.url, hash: file.hash };
}

function getReleaseComponent(
	release: Release,
	version: string,
	type: DotnetType,
): ReleaseComponent | undefined {
	if (type === 'sdk') {
		return release.sdks?.find((sdk) => sdk.version === version);
	}
	if (type === 'aspnetcore') {
		return release['aspnetcore-runtime'];
	}
	return release.runtime;
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
				const waitSeconds = attempt * 5;
				core.warning(`Download failed, retrying in ${waitSeconds}s...`);
				await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
			}
		}
	}

	throw lastError || new Error('Download failed for unknown reason');
}
