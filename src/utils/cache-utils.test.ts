import * as cache from '@actions/cache';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	type CacheVersions,
	cacheExists,
	generateCacheKey,
	getArchiveCacheDirectory,
	restoreCache,
	saveCache,
} from './cache-utils';
import * as platformUtils from './platform-utils';

// Mock dependencies
vi.mock('@actions/cache');
vi.mock('./platform-utils');

describe('getArchiveCacheDirectory', () => {
	afterEach(() => {
		delete process.env.RUNNER_TOOL_CACHE;
		delete process.env.AGENT_TOOLSDIRECTORY;
	});

	it('should return archive directory from RUNNER_TOOL_CACHE', () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';

		const dir = getArchiveCacheDirectory();

		expect(dir).toBe('/runner/tool-cache/dotnet-archives');
	});

	it('should return archive directory from AGENT_TOOLSDIRECTORY', () => {
		process.env.AGENT_TOOLSDIRECTORY = '/agent/tools';

		const dir = getArchiveCacheDirectory();

		expect(dir).toBe('/agent/tools/dotnet-archives');
	});

	it('should prefer AGENT_TOOLSDIRECTORY over RUNNER_TOOL_CACHE', () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		process.env.AGENT_TOOLSDIRECTORY = '/agent/tools';

		const dir = getArchiveCacheDirectory();

		expect(dir).toBe('/agent/tools/dotnet-archives');
	});

	it('should throw error when neither environment variable is set', () => {
		expect(() => getArchiveCacheDirectory()).toThrow(
			'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set.',
		);
	});
});

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

		expect(key).toMatch(/^dotnet-archives-linux-x64-[a-f0-9]{12}$/);
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
		const mockArchiveDir = '/runner/tool-cache/dotnet-archives';
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-archives-linux-x64-abc123',
		);

		const result = await restoreCache('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(true);
		expect(cache.restoreCache).toHaveBeenCalledWith(
			[mockArchiveDir],
			'dotnet-archives-linux-x64-abc123',
		);
	});

	it('should return false when cache is not found', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const result = await restoreCache('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(false);
	});

	it('should return false and log warning on cache restore error', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Network error'));

		const result = await restoreCache('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(false);
	});
});

describe('saveCache', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should save cache successfully', async () => {
		const mockArchiveDir = '/runner/tool-cache/dotnet-archives';
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.saveCache).mockResolvedValue(123);

		await saveCache('dotnet-archives-linux-x64-abc123');

		expect(cache.saveCache).toHaveBeenCalledWith(
			[mockArchiveDir],
			'dotnet-archives-linux-x64-abc123',
		);
	});

	it('should not throw on cache save error', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.saveCache).mockRejectedValue(new Error('Save failed'));

		await expect(
			saveCache('dotnet-archives-linux-x64-abc123'),
		).resolves.not.toThrow();
	});

	it('should handle ReserveCacheError gracefully', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.saveCache).mockRejectedValue(
			new Error('ReserveCacheError: Cache already exists'),
		);

		await expect(
			saveCache('dotnet-archives-linux-x64-abc123'),
		).resolves.not.toThrow();
	});
});

describe('cacheExists', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should return true when cache entry exists', async () => {
		const mockArchiveDir = '/runner/tool-cache/dotnet-archives';
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-archives-linux-x64-abc123',
		);

		const result = await cacheExists('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(true);
		expect(cache.restoreCache).toHaveBeenCalledWith(
			[mockArchiveDir],
			'dotnet-archives-linux-x64-abc123',
			undefined,
			{ lookupOnly: true },
		);
	});

	it('should return false when cache entry does not exist', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const result = await cacheExists('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(false);
	});

	it('should return false on cache lookup error', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Lookup failed'));

		const result = await cacheExists('dotnet-archives-linux-x64-abc123');

		expect(result).toBe(false);
	});

	it('should use lookupOnly flag to avoid restoring', async () => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-archives-linux-x64-abc123',
		);

		await cacheExists('dotnet-archives-linux-x64-abc123');

		const callArgs = vi.mocked(cache.restoreCache).mock.calls[0];
		expect(callArgs[3]?.lookupOnly).toBe(true);
	});
});
