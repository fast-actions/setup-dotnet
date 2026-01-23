import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { getArchitecture, getPlatform } from './platform-utils';

export interface CacheVersions {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}

/**
 * Get the archive cache directory for storing .NET installer archives
 */
export function getArchiveCacheDirectory(): string {
	const toolCache =
		process.env.AGENT_TOOLSDIRECTORY || process.env.RUNNER_TOOL_CACHE;
	if (!toolCache) {
		throw new Error(
			'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set.',
		);
	}
	return path.join(toolCache, 'dotnet-archives');
}

/**
 * Generate a cache key from resolved versions
 * Format: dotnet-archives-{platform}-{arch}-{hash}
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

	return `dotnet-archives-${platform}-${arch}-${shortHash}`;
}

/**
 * Try to restore .NET installer archives from cache
 * Returns true if cache was restored, false otherwise
 */
export async function restoreCache(cacheKey: string): Promise<boolean> {
	const archiveDir = getArchiveCacheDirectory();

	try {
		const restoredKey = await cache.restoreCache([archiveDir], cacheKey);

		if (restoredKey) {
			core.debug(`Archive cache restored from: ${archiveDir}`);
			return true;
		}

		core.debug('Archive cache not found');
		return false;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Archive cache restore failed: ${errorMsg}`);
		return false;
	}
}

/**
 * Save .NET installer archives to cache
 */
export async function saveCache(cacheKey: string): Promise<void> {
	const archiveDir = getArchiveCacheDirectory();

	core.debug(`Saving archive cache: ${cacheKey}`);
	core.debug(`Cache path: ${archiveDir}`);

	try {
		await cache.saveCache([archiveDir], cacheKey);
		core.debug('Archive cache saved successfully');
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Cache save failures are not critical - log as warning
		if (errorMsg.includes('ReserveCacheError')) {
			core.warning('Archive cache already exists for this key');
		} else {
			core.warning(`Failed to save archive cache: ${errorMsg}`);
		}
	}
}

/**
 * Check if a cache entry exists for the given key without restoring it
 */
export async function cacheExists(cacheKey: string): Promise<boolean> {
	try {
		core.debug(`Checking if archive cache exists: ${cacheKey}`);
		const archiveDir = getArchiveCacheDirectory();
		const restoredKey = await cache.restoreCache(
			[archiveDir],
			cacheKey,
			undefined,
			{
				lookupOnly: true,
			},
		);
		return restoredKey !== undefined;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Error checking archive cache existence: ${errorMsg}`);
		return false;
	}
}
