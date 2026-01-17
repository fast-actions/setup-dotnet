import * as cache from '@actions/cache';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as installer from '../installer';
import {
	type CacheVersions,
	generateCacheKey,
	restoreCache,
	saveCache,
} from './cache-utils';
import * as platformUtils from './platform-utils';

// Mock dependencies
vi.mock('@actions/cache');
vi.mock('../installer');
vi.mock('./platform-utils');

describe('generateCacheKey', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should generate cache key from resolved versions', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const versions: CacheVersions = {
			sdk: ['10.0.102'],
			runtime: ['8.0.29'],
			aspnetcore: [],
		};

		const key = generateCacheKey(versions);

		expect(key).toMatch(/^dotnet-linux-x64-[a-f0-9]{12}$/);
	});

	it('should generate same key for same versions regardless of order', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('osx');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('arm64');

		const versions1: CacheVersions = {
			sdk: ['10.0.102', '9.0.0'],
			runtime: ['8.0.29'],
			aspnetcore: [],
		};

		const versions2: CacheVersions = {
			sdk: ['9.0.0', '10.0.102'],
			runtime: ['8.0.29'],
			aspnetcore: [],
		};

		const key1 = generateCacheKey(versions1);
		const key2 = generateCacheKey(versions2);

		expect(key1).toBe(key2);
	});

	it('should generate different keys for different versions', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('win');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const versions1: CacheVersions = {
			sdk: ['10.0.102'],
			runtime: [],
			aspnetcore: [],
		};

		const versions2: CacheVersions = {
			sdk: ['10.0.103'],
			runtime: [],
			aspnetcore: [],
		};

		const key1 = generateCacheKey(versions1);
		const key2 = generateCacheKey(versions2);

		expect(key1).not.toBe(key2);
	});

	it('should generate different keys for different platforms', () => {
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const versions: CacheVersions = {
			sdk: ['10.0.102'],
			runtime: [],
			aspnetcore: [],
		};

		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		const key1 = generateCacheKey(versions);

		vi.mocked(platformUtils.getPlatform).mockReturnValue('win');
		const key2 = generateCacheKey(versions);

		expect(key1).not.toBe(key2);
	});

	it('should include all version types in key', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const versions1: CacheVersions = {
			sdk: ['10.0.102'],
			runtime: [],
			aspnetcore: [],
		};

		const versions2: CacheVersions = {
			sdk: ['10.0.102'],
			runtime: ['8.0.29'],
			aspnetcore: [],
		};

		const key1 = generateCacheKey(versions1);
		const key2 = generateCacheKey(versions2);

		expect(key1).not.toBe(key2);
	});
});

describe('restoreCache', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should return true when cache is restored', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.restoreCache).mockResolvedValue('dotnet-linux-x64-abc123');

		const result = await restoreCache('dotnet-linux-x64-abc123');

		expect(result).toBe(true);
		expect(cache.restoreCache).toHaveBeenCalledWith(
			['/path/to/dotnet'],
			'dotnet-linux-x64-abc123',
		);
	});

	it('should return false when cache is not found', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const result = await restoreCache('dotnet-linux-x64-abc123');

		expect(result).toBe(false);
	});

	it('should return false and log warning on cache restore error', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Network error'));

		const result = await restoreCache('dotnet-linux-x64-abc123');

		expect(result).toBe(false);
	});
});

describe('saveCache', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should save cache successfully', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.saveCache).mockResolvedValue(123);

		await saveCache('dotnet-linux-x64-abc123');

		expect(cache.saveCache).toHaveBeenCalledWith(
			['/path/to/dotnet'],
			'dotnet-linux-x64-abc123',
		);
	});

	it('should not throw on cache save error', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.saveCache).mockRejectedValue(new Error('Save failed'));

		await expect(saveCache('dotnet-linux-x64-abc123')).resolves.not.toThrow();
	});

	it('should handle ReserveCacheError gracefully', async () => {
		vi.mocked(installer.getDotNetInstallDirectory).mockReturnValue(
			'/path/to/dotnet',
		);
		vi.mocked(cache.saveCache).mockRejectedValue(
			new Error('ReserveCacheError: Cache already exists'),
		);

		await expect(saveCache('dotnet-linux-x64-abc123')).resolves.not.toThrow();
	});
});
