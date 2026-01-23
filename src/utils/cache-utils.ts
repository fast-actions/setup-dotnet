import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as crypto from 'node:crypto';
import { getDotNetInstallDirectory } from '../installer';
import { getArchitecture, getPlatform } from './platform-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CacheVersions {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}

/**
 * Generate a cache key from resolved versions
 * Format: dotnet-{platform}-{arch}-{hash}
 */
export function generateCacheKey(versions: CacheVersions): string {
	const platform = getPlatform();
	const arch = getArchitecture();

	// Create deterministic string from all versions
	const versionString = [
		...versions.sdk.map((v) => `sdk:${v}`),
		...versions.runtime.map((v) => `runtime:${v}`),
		...versions.aspnetcore.map((v) => `aspnetcore:${v}`),
	]
		.sort((a, b) => a.localeCompare(b))
		.join(',');

	// Generate hash from version string
	const hash = crypto.createHash('sha256').update(versionString).digest('hex');

	// Use first 12 characters of hash for readability
	const shortHash = hash.substring(0, 12);

	return `dotnet-${platform}-${arch}-${shortHash}`;
}

/**
 * Try to restore .NET installation from cache
 * Returns true if cache was restored, false otherwise
 */
export async function restoreCache(cacheKey: string): Promise<boolean> {
	const installDir = getDotNetInstallDirectory();

	try {
		const restoredKey = await cache.restoreCache([installDir], cacheKey);

		if (restoredKey) {
			return true;
		}

		core.debug('Cache not found');
		return false;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Cache restore failed: ${errorMsg}`);
		return false;
	}
}

/**
 * Save .NET installation to cache
 */
export async function saveCache(cacheKey: string): Promise<void> {
	const installDir = getDotNetInstallDirectory();

	core.info(`Saving cache: ${cacheKey}`);
	core.info(`Cache path: ${installDir}`);
	core.info(`GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || 'not set'}`);
	core.info(`RUNNER_TOOL_CACHE: ${process.env.RUNNER_TOOL_CACHE || 'not set'}`);
	core.info(
		`AGENT_TOOLSDIRECTORY: ${process.env.AGENT_TOOLSDIRECTORY || 'not set'}`,
	);
	core.info(`RUNNER_TEMP: ${process.env.RUNNER_TEMP || 'not set'}`);

	// Debug: Check if directory exists
	const directoryExists = fs.existsSync(installDir);
	core.info(`Directory exists: ${directoryExists}`);

	if (directoryExists) {
		try {
			const stats = fs.statSync(installDir);
			core.info(`Directory is valid: ${stats.isDirectory()}`);

			// List directory contents to check if it's empty
			const contents = fs.readdirSync(installDir);
			core.info(`Directory contains ${contents.length} items`);

			if (contents.length > 0) {
				core.info(`First 5 items: ${contents.slice(0, 5).join(', ')}`);
			} else {
				core.warning('Directory is EMPTY - this is likely the problem!');
			}

			// Check if critical files exist
			const dotnetBinary =
				process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
			const binaryPath = `${installDir}/${dotnetBinary}`;
			const binaryExists = fs.existsSync(binaryPath);
			core.info(`${dotnetBinary} exists: ${binaryExists}`);

			// Check if we can list stat the parent directory
			const parentDir = path.dirname(installDir);
			const parentExists = fs.existsSync(parentDir);
			core.info(`Parent directory exists: ${parentExists}`);
			if (parentExists) {
				const parentContents = fs.readdirSync(parentDir);
				core.info(`Parent contains: ${parentContents.join(', ')}`);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			core.warning(`Failed to read directory: ${errorMsg}`);
		}
	} else {
		core.warning(`Directory does not exist: ${installDir}`);
	}

	// Normalize path for cache (use forward slashes)
	const normalizedPath = installDir.replace(/\\/g, '/');
	core.info(`Normalized cache path: ${normalizedPath}`);

	try {
		await cache.saveCache([normalizedPath], cacheKey);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Cache save failures are not critical - log as warning
		if (errorMsg.includes('ReserveCacheError')) {
			core.warning('Cache already exists for this key');
		} else {
			core.warning(`Failed to save cache: ${errorMsg}`);
		}
	}
}

/**
 * Check if a cache entry exists for the given key without restoring it
 */
export async function cacheExists(cacheKey: string): Promise<boolean> {
	try {
		core.debug(`Checking if cache exists: ${cacheKey}`);
		const installDir = getDotNetInstallDirectory();
		const restoredKey = await cache.restoreCache(
			[installDir],
			cacheKey,
			undefined,
			{
				lookupOnly: true,
			},
		);
		return restoredKey !== undefined;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Error checking cache existence: ${errorMsg}`);
		return false;
	}
}
