import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

interface CachedResponse {
	data: unknown;
	timestamp: number;
	url: string;
}

const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

let cacheEnabled = false;
const requestedUrls = new Set<string>();

/**
 * Configure API caching behavior
 */
export function configureCaching(enabled: boolean): void {
	cacheEnabled = enabled;
	core.debug(`API caching ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Get cache directory for API responses
 */
function getCacheDirectory(): string {
	return path.join(os.tmpdir(), 'dotnet-api-cache');
}

/**
 * Generate cache key from URL
 */
function generateCacheKey(url: string): string {
	const urlHash = crypto.createHash('sha256').update(url).digest('hex');
	return `dotnet-api-${urlHash.substring(0, 16)}`;
}

/**
 * Get cache file path for a URL
 */
function getCacheFilePath(url: string): string {
	const cacheKey = generateCacheKey(url);
	return path.join(getCacheDirectory(), `${cacheKey}.json`);
}

/**
 * Check if cached response exists and is still valid (< 12 hours old)
 */
async function getCachedResponse(url: string): Promise<unknown | null> {
	if (!cacheEnabled) {
		return null;
	}

	try {
		const cacheFile = getCacheFilePath(url);
		const content = await fs.readFile(cacheFile, 'utf-8');
		const cached = JSON.parse(content) as CachedResponse;

		const age = Date.now() - cached.timestamp;
		const ageHours = (age / (1000 * 60 * 60)).toFixed(1);

		if (age < CACHE_DURATION_MS) {
			core.debug(`Using cached API response (${ageHours}h old): ${url}`);
			return cached.data;
		}

		core.debug(`Cache expired (${ageHours}h old): ${url}`);
		return null;
	} catch {
		// Cache file doesn't exist or is invalid - that's fine
		core.debug(`No valid cache found for: ${url}`);
		return null;
	}
}

/**
 * Save API response to cache
 */
async function saveCachedResponse(url: string, data: unknown): Promise<void> {
	if (!cacheEnabled) {
		return;
	}

	try {
		const cacheDir = getCacheDirectory();
		await fs.mkdir(cacheDir, { recursive: true });

		const cacheFile = getCacheFilePath(url);
		const cached: CachedResponse = {
			data,
			timestamp: Date.now(),
			url,
		};

		await fs.writeFile(cacheFile, JSON.stringify(cached), 'utf-8');
		core.debug(`Cached API response: ${url}`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.warning(`Failed to cache API response: ${errorMsg}`);
	}
}

/**
 * Generate cache key from requested URLs
 */
function generateApiCacheKey(): string {
	if (requestedUrls.size === 0) {
		return 'dotnet-api-cache-v1-empty';
	}

	// Sort URLs for deterministic cache key
	const sortedUrls = Array.from(requestedUrls).sort();
	const urlsString = sortedUrls.join('|');
	const urlsHash = crypto
		.createHash('sha256')
		.update(urlsString)
		.digest('hex')
		.substring(0, 12);

	// Include time window for automatic expiration
	const currentWindow = Math.floor(Date.now() / CACHE_DURATION_MS);

	return `dotnet-api-cache-v1-${currentWindow}-${urlsHash}`;
}

/**
 * Try to restore API cache from GitHub Actions cache
 */
async function restoreApiCache(): Promise<void> {
	if (!cacheEnabled) {
		return;
	}

	try {
		const cacheDir = getCacheDirectory();
		const cacheKey = generateApiCacheKey();
		core.debug(`Attempting to restore API cache: ${cacheKey}`);

		const restored = await cache.restoreCache([cacheDir], cacheKey);

		if (restored) {
			core.debug(`Restored API cache from: ${restored}`);
		} else {
			core.debug('No API cache found, will fetch fresh data');
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		core.debug(`Failed to restore API cache: ${errorMsg}`);
	}
}

/**
 * Save API cache to GitHub Actions cache
 */
async function saveApiCache(): Promise<void> {
	if (!cacheEnabled) {
		return;
	}

	try {
		const cacheDir = getCacheDirectory();

		// Check if cache directory has any files
		const files = await fs.readdir(cacheDir).catch(() => []);
		if (files.length === 0) {
			core.debug('No API responses to cache');
			return;
		}

		const cacheKey = generateApiCacheKey();

		core.debug(`Saving API cache: ${cacheKey}`);
		core.debug(`Cached URLs: ${Array.from(requestedUrls).sort().join(', ')}`);

		await cache.saveCache([cacheDir], cacheKey);
		core.debug(`Saved API cache with ${files.length} response(s)`);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Cache save failures are not critical - log as warning
		if (errorMsg.includes('ReserveCacheError')) {
			core.debug('API cache already exists for this time window');
		} else {
			core.debug(`Failed to save API cache: ${errorMsg}`);
		}
	}
}

let cacheRestored = false;

/**
 * Fetch JSON from URL with 12-hour caching
 * Only uses cache if caching is enabled via configureCaching()
 */
export async function fetchWithCache<T>(url: string): Promise<T> {
	// Track requested URL for cache key generation
	if (cacheEnabled) {
		requestedUrls.add(url);
	}

	// Restore cache on first API call
	if (cacheEnabled && !cacheRestored) {
		await restoreApiCache();
		cacheRestored = true;
	}

	// Try to get from cache
	const cachedData = await getCachedResponse(url);
	if (cachedData !== null) {
		return cachedData as T;
	}

	// Fetch fresh data
	core.debug(`Fetching fresh API response: ${url}`);
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`API request failed: ${response.status} ${response.statusText}`,
		);
	}

	const data = (await response.json()) as T;

	// Save to cache
	await saveCachedResponse(url, data);

	return data;
}

/**
 * Save all cached API responses to GitHub Actions cache
 * Should be called at the end of the action
 */
export async function persistApiCache(): Promise<void> {
	if (cacheEnabled && cacheRestored) {
		await saveApiCache();
	}
}

/**
 * Clear all API cache (for testing purposes)
 */
export async function clearApiCache(): Promise<void> {
	try {
		const cacheDir = getCacheDirectory();
		await fs.rm(cacheDir, { recursive: true, force: true });
	} catch {
		// Ignore errors
	}
	cacheRestored = false;
	requestedUrls.clear();
}
