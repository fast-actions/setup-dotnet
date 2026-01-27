import * as cache from '@actions/cache';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	generateVersionCacheKey,
	getCacheHitStatus,
	restoreVersionCache,
	restoreVersionCaches,
	saveVersionCache,
	versionCacheExists,
} from './cache-utils';
import * as platformUtils from './platform-utils';

// Mock dependencies
vi.mock('@actions/cache');
vi.mock('./platform-utils');

describe('generateVersionCacheKey', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should generate cache key for SDK version', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const key = generateVersionCacheKey('10.0.102', 'sdk');

		expect(key).toBe('dotnet-linux-x64-sdk-10.0.102');
	});

	it('should generate cache key for runtime version', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('win');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const key = generateVersionCacheKey('8.0.29', 'runtime');

		expect(key).toBe('dotnet-win-x64-runtime-8.0.29');
	});

	it('should generate cache key for aspnetcore version', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('osx');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('arm64');

		const key = generateVersionCacheKey('9.0.0', 'aspnetcore');

		expect(key).toBe('dotnet-osx-arm64-aspnetcore-9.0.0');
	});

	it('should generate different keys for different platforms', () => {
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		const key1 = generateVersionCacheKey('10.0.102', 'sdk');

		vi.mocked(platformUtils.getPlatform).mockReturnValue('win');
		const key2 = generateVersionCacheKey('10.0.102', 'sdk');

		expect(key1).not.toBe(key2);
	});

	it('should generate different keys for different types', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const sdkKey = generateVersionCacheKey('8.0.0', 'sdk');
		const runtimeKey = generateVersionCacheKey('8.0.0', 'runtime');

		expect(sdkKey).not.toBe(runtimeKey);
	});
});

describe('restoreVersionCache', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should return restored:true when cache is restored', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-linux-x64-sdk-10.0.102',
		);

		const result = await restoreVersionCache(
			'10.0.102',
			'sdk',
			'/path/to/cache',
		);

		expect(result).toEqual({
			version: '10.0.102',
			type: 'sdk',
			restored: true,
		});
		expect(cache.restoreCache).toHaveBeenCalledWith(
			['/path/to/cache'],
			'dotnet-linux-x64-sdk-10.0.102',
		);
	});

	it('should return restored:false when cache is not found', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const result = await restoreVersionCache(
			'10.0.102',
			'sdk',
			'/path/to/cache',
		);

		expect(result).toEqual({
			version: '10.0.102',
			type: 'sdk',
			restored: false,
		});
	});

	it('should return restored:false on cache restore error', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Network error'));

		const result = await restoreVersionCache(
			'10.0.102',
			'sdk',
			'/path/to/cache',
		);

		expect(result).toEqual({
			version: '10.0.102',
			type: 'sdk',
			restored: false,
		});
	});
});

describe('restoreVersionCaches', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should restore multiple versions in parallel', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache)
			.mockResolvedValueOnce('dotnet-linux-x64-sdk-10.0.102')
			.mockResolvedValueOnce(undefined);

		const results = await restoreVersionCaches([
			{ version: '10.0.102', type: 'sdk', targetPath: '/path/to/sdk' },
			{ version: '8.0.0', type: 'runtime', targetPath: '/path/to/runtime' },
		]);

		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			version: '10.0.102',
			type: 'sdk',
			restored: true,
		});
		expect(results[1]).toEqual({
			version: '8.0.0',
			type: 'runtime',
			restored: false,
		});
	});
});

describe('saveVersionCache', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should save cache successfully', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockResolvedValue(123);

		await saveVersionCache('10.0.102', 'sdk', '/path/to/cache');

		expect(cache.saveCache).toHaveBeenCalledWith(
			['/path/to/cache'],
			'dotnet-linux-x64-sdk-10.0.102',
		);
	});

	it('should not throw on cache save error', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockRejectedValue(new Error('Save failed'));

		await expect(
			saveVersionCache('10.0.102', 'sdk', '/path/to/cache'),
		).resolves.not.toThrow();
	});

	it('should handle ReserveCacheError gracefully', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockRejectedValue(
			new Error('ReserveCacheError: Cache already exists'),
		);

		await expect(
			saveVersionCache('10.0.102', 'sdk', '/path/to/cache'),
		).resolves.not.toThrow();
	});
});

describe('versionCacheExists', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should return true when cache entry exists', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-linux-x64-sdk-10.0.102',
		);

		const result = await versionCacheExists('10.0.102', 'sdk');

		expect(result).toBe(true);
		expect(cache.restoreCache).toHaveBeenCalledWith(
			expect.any(Array),
			'dotnet-linux-x64-sdk-10.0.102',
			undefined,
			{ lookupOnly: true },
		);
	});

	it('should return false when cache entry does not exist', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const result = await versionCacheExists('10.0.102', 'sdk');

		expect(result).toBe(false);
	});

	it('should return false on cache lookup error', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Lookup failed'));

		const result = await versionCacheExists('10.0.102', 'sdk');

		expect(result).toBe(false);
	});
});

describe('getCacheHitStatus', () => {
	it('should return "true" when all versions restored', () => {
		const results = [
			{ version: '10.0.102', type: 'sdk' as const, restored: true },
			{ version: '8.0.0', type: 'runtime' as const, restored: true },
		];

		expect(getCacheHitStatus(results)).toBe('true');
	});

	it('should return "false" when no versions restored', () => {
		const results = [
			{ version: '10.0.102', type: 'sdk' as const, restored: false },
			{ version: '8.0.0', type: 'runtime' as const, restored: false },
		];

		expect(getCacheHitStatus(results)).toBe('false');
	});

	it('should return "partial" when some versions restored', () => {
		const results = [
			{ version: '10.0.102', type: 'sdk' as const, restored: true },
			{ version: '8.0.0', type: 'runtime' as const, restored: false },
		];

		expect(getCacheHitStatus(results)).toBe('partial');
	});

	it('should return "false" for empty results', () => {
		expect(getCacheHitStatus([])).toBe('false');
	});
});
