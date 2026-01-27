import * as cache from '@actions/cache';
import * as core from '@actions/core';
import type { DotnetType } from '../types';
import { getArchitecture, getPlatform } from './platform-utils';

/**
 * Generate a cache key for a specific .NET version
 * Format: dotnet-{platform}-{arch}-{type}-{version}
 */
export function generateVersionCacheKey(
	version: string,
	type: DotnetType,
): string {
	const platform = getPlatform();
	const arch = getArchitecture();
	return `dotnet-${platform}-${arch}-${type}-${version}`;
}

export interface VersionCacheResult {
	version: string;
	type: DotnetType;
	restored: boolean;
}

/**
 * Try to restore a single .NET version from cache
 * @returns Object with version, type, and whether it was restored
 */
export async function restoreVersionCache(
	version: string,
	type: DotnetType,
	targetPath: string,
): Promise<VersionCacheResult> {
	const cacheKey = generateVersionCacheKey(version, type);

	try {
		core.debug(`Restoring cache: ${cacheKey} -> ${targetPath}`);
		const restoredKey = await cache.restoreCache([targetPath], cacheKey);

		if (restoredKey) {
			core.debug(`Cache restored: ${cacheKey}`);
			return { version, type, restored: true };
		}

		core.debug(`Cache not found: ${cacheKey}`);
		return { version, type, restored: false };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.warning(
			`Cache restore failed for ${type} ${version}: ${errorMessage}`,
		);
		return { version, type, restored: false };
	}
}

/**
 * Restore multiple .NET versions from cache in parallel
 * @returns Array of results indicating which versions were restored
 */
export async function restoreVersionCaches(
	versions: Array<{ version: string; type: DotnetType; targetPath: string }>,
): Promise<VersionCacheResult[]> {
	const restorePromises = versions.map((v) =>
		restoreVersionCache(v.version, v.type, v.targetPath),
	);
	return Promise.all(restorePromises);
}

/**
 * Save a single .NET version to cache
 */
export async function saveVersionCache(
	version: string,
	type: DotnetType,
	sourcePath: string,
): Promise<void> {
	const cacheKey = generateVersionCacheKey(version, type);

	core.debug(`Saving cache: ${cacheKey} <- ${sourcePath}`);

	try {
		await cache.saveCache([sourcePath], cacheKey);
		core.debug(`Cache saved: ${cacheKey}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Cache save failures are not critical - log as warning
		if (errorMessage.includes('ReserveCacheError')) {
			core.debug(`Cache already exists: ${cacheKey}`);
		} else {
			core.warning(
				`Failed to save cache for ${type} ${version}: ${errorMessage}`,
			);
		}
	}
}

/**
 * Check if a cache entry exists for a specific version without restoring it
 */
export async function versionCacheExists(
	version: string,
	type: DotnetType,
): Promise<boolean> {
	const cacheKey = generateVersionCacheKey(version, type);
	// Use a dummy path for lookup-only check
	const dummyPath = `/tmp/dotnet-cache-check-${Date.now()}`;

	try {
		core.debug(`Checking if cache exists: ${cacheKey}`);
		const restoredKey = await cache.restoreCache(
			[dummyPath],
			cacheKey,
			undefined,
			{
				lookupOnly: true,
			},
		);
		return restoredKey !== undefined;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.debug(`Error checking cache existence: ${errorMessage}`);
		return false;
	}
}

export type CacheHitStatus = 'true' | 'false' | 'partial';

/**
 * Determine cache hit status from restore results
 */
export function getCacheHitStatus(
	results: VersionCacheResult[],
): CacheHitStatus {
	if (results.length === 0) {
		return 'false';
	}

	const restoredCount = results.filter((r) => r.restored).length;

	if (restoredCount === results.length) {
		return 'true';
	}
	if (restoredCount > 0) {
		return 'partial';
	}
	return 'false';
}
