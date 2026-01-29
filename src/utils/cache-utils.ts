import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import type { DotnetType } from '../types';
import { getArchitecture, getPlatform } from './platform-utils';

export interface VersionEntry {
	version: string;
	type: DotnetType;
}

export function getDotnetCacheDirectory(): string {
	const runnerTemp = process.env.RUNNER_TEMP;
	if (!runnerTemp) {
		throw new Error('RUNNER_TEMP environment variable is not set.');
	}
	return path.join(runnerTemp, 'dotnet-cache');
}

export function getVersionCachePath(version: string, type: DotnetType): string {
	return path.join(getDotnetCacheDirectory(), type, version);
}

export function generateVersionsHash(versions: VersionEntry[]): string {
	const sorted = [...versions].sort(
		(a, b) =>
			a.type.localeCompare(b.type) || a.version.localeCompare(b.version),
	);
	const data = sorted.map((v) => `${v.type}:${v.version}`).join('|');
	return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
}

export function generateUnifiedCacheKey(versions: VersionEntry[]): string {
	const platform = getPlatform();
	const arch = getArchitecture();
	const hash = generateVersionsHash(versions);
	return `dotnet-${platform}-${arch}-${hash}`;
}

export async function restoreUnifiedCache(
	versions: VersionEntry[],
): Promise<boolean> {
	const cacheKey = generateUnifiedCacheKey(versions);
	const cachePath = getDotnetCacheDirectory();

	try {
		await io.mkdirP(cachePath);
		core.debug(`Restoring unified cache: ${cacheKey}`);
		const restoredKey = await cache.restoreCache([cachePath], cacheKey);

		if (restoredKey) {
			core.debug(`Unified cache restored: ${cacheKey}`);
			return true;
		}

		core.debug(`Unified cache not found: ${cacheKey}`);
		return false;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.warning(`Cache restore failed: ${errorMessage}`);
		return false;
	}
}

export async function saveUnifiedCache(
	versions: VersionEntry[],
): Promise<void> {
	const cacheKey = generateUnifiedCacheKey(versions);
	const cachePath = getDotnetCacheDirectory();

	core.debug(`Saving unified cache: ${cacheKey}`);

	try {
		await cache.saveCache([cachePath], cacheKey);
		core.debug(`Unified cache saved: ${cacheKey}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes('ReserveCacheError')) {
			core.debug(`Cache already exists (skipped): ${cacheKey}`);
		} else {
			core.warning(`Failed to save cache: ${errorMessage}`);
		}
	}
}
