import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as crypto from 'node:crypto';
import { getDotNetInstallDirectory } from '../installer';
import { getArchitecture, getPlatform } from './platform-utils';

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
		.sort()
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

	core.info(`🔍 Looking for cache: ${cacheKey}`);
	core.debug(`Cache restore path: ${installDir}`);

	try {
		const restoredKey = await cache.restoreCache([installDir], cacheKey);

		if (restoredKey) {
			core.info(`✓ Cache restored: ${restoredKey}`);
			return true;
		}

		core.info('⚠ Cache not found, will download .NET');
		return false;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Cache restore failed: ${errorMsg}`);
		core.debug('Continuing with download...');
		return false;
	}
}

/**
 * Save .NET installation to cache
 */
export async function saveCache(cacheKey: string): Promise<void> {
	const installDir = getDotNetInstallDirectory();

	core.info(`💾 Saving cache: ${cacheKey}`);
	core.debug(`Cache save path: ${installDir}`);

	try {
		await cache.saveCache([installDir], cacheKey);
		core.info('✓ Cache saved successfully');
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
