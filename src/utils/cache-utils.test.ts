import * as cache from '@actions/cache';
import * as io from '@actions/io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	generateUnifiedCacheKey,
	generateVersionsHash,
	getDotnetCacheDirectory,
	getVersionCachePath,
	restoreUnifiedCache,
	saveUnifiedCache,
	type VersionEntry,
} from './cache-utils';
import * as platformUtils from './platform-utils';

vi.mock('@actions/cache');
vi.mock('@actions/io');
vi.mock('./platform-utils');

describe('getDotnetCacheDirectory', () => {
	const originalRunnerTemp = process.env.RUNNER_TEMP;

	afterEach(() => {
		process.env.RUNNER_TEMP = originalRunnerTemp;
	});

	it('should return dotnet-cache directory path', () => {
		process.env.RUNNER_TEMP = '/tmp/runner';

		const result = getDotnetCacheDirectory();

		expect(result).toBe('/tmp/runner/dotnet-cache');
	});

	it('should throw error when RUNNER_TEMP is not set', () => {
		delete process.env.RUNNER_TEMP;

		expect(() => getDotnetCacheDirectory()).toThrow(
			'RUNNER_TEMP environment variable is not set.',
		);
	});
});

describe('getVersionCachePath', () => {
	const originalRunnerTemp = process.env.RUNNER_TEMP;

	beforeEach(() => {
		process.env.RUNNER_TEMP = '/tmp/runner';
	});

	afterEach(() => {
		process.env.RUNNER_TEMP = originalRunnerTemp;
	});

	it('should return cache path for SDK version', () => {
		const path = getVersionCachePath('8.0.100', 'sdk');

		expect(path).toBe('/tmp/runner/dotnet-cache/sdk/8.0.100');
	});

	it('should return cache path for runtime version', () => {
		const path = getVersionCachePath('8.0.0', 'runtime');

		expect(path).toBe('/tmp/runner/dotnet-cache/runtime/8.0.0');
	});

	it('should return cache path for aspnetcore version', () => {
		const path = getVersionCachePath('9.0.0', 'aspnetcore');

		expect(path).toBe('/tmp/runner/dotnet-cache/aspnetcore/9.0.0');
	});
});

describe('generateVersionsHash', () => {
	it('should generate hash from versions', () => {
		const versions: VersionEntry[] = [
			{ version: '8.0.100', type: 'sdk' },
			{ version: '8.0.0', type: 'runtime' },
		];

		const hash = generateVersionsHash(versions);

		expect(hash).toHaveLength(8);
		expect(typeof hash).toBe('string');
	});

	it('should generate same hash for same versions in different order', () => {
		const versions1: VersionEntry[] = [
			{ version: '8.0.100', type: 'sdk' },
			{ version: '8.0.0', type: 'runtime' },
		];

		const versions2: VersionEntry[] = [
			{ version: '8.0.0', type: 'runtime' },
			{ version: '8.0.100', type: 'sdk' },
		];

		const hash1 = generateVersionsHash(versions1);
		const hash2 = generateVersionsHash(versions2);

		expect(hash1).toBe(hash2);
	});

	it('should generate different hashes for different versions', () => {
		const versions1: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		const versions2: VersionEntry[] = [{ version: '9.0.100', type: 'sdk' }];

		const hash1 = generateVersionsHash(versions1);
		const hash2 = generateVersionsHash(versions2);

		expect(hash1).not.toBe(hash2);
	});
});

describe('generateUnifiedCacheKey', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should generate unified cache key with platform and arch', () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		const key = generateUnifiedCacheKey(versions);

		expect(key).toMatch(/^dotnet-linux-x64-[a-f0-9]{8}$/);
	});

	it('should generate different keys for different platforms', () => {
		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		const key1 = generateUnifiedCacheKey(versions);

		vi.mocked(platformUtils.getPlatform).mockReturnValue('win');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		const key2 = generateUnifiedCacheKey(versions);

		expect(key1).not.toBe(key2);
	});
});

describe('restoreUnifiedCache', () => {
	const originalRunnerTemp = process.env.RUNNER_TEMP;

	beforeEach(() => {
		process.env.RUNNER_TEMP = '/tmp/runner';
	});

	afterEach(() => {
		vi.resetAllMocks();
		process.env.RUNNER_TEMP = originalRunnerTemp;
	});

	it('should return true when cache is restored', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(io.mkdirP).mockResolvedValue();
		vi.mocked(cache.restoreCache).mockResolvedValue(
			'dotnet-linux-x64-abc12345',
		);

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];
		const result = await restoreUnifiedCache(versions);

		expect(result).toBe(true);
		expect(io.mkdirP).toHaveBeenCalledWith('/tmp/runner/dotnet-cache');
		expect(cache.restoreCache).toHaveBeenCalledWith(
			['/tmp/runner/dotnet-cache'],
			expect.stringMatching(/^dotnet-linux-x64-[a-f0-9]{8}$/),
		);
	});

	it('should return false when cache is not found', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(io.mkdirP).mockResolvedValue();
		vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];
		const result = await restoreUnifiedCache(versions);

		expect(result).toBe(false);
	});

	it('should return false on cache restore error', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(io.mkdirP).mockResolvedValue();
		vi.mocked(cache.restoreCache).mockRejectedValue(new Error('Network error'));

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];
		const result = await restoreUnifiedCache(versions);

		expect(result).toBe(false);
	});
});

describe('saveUnifiedCache', () => {
	const originalRunnerTemp = process.env.RUNNER_TEMP;

	beforeEach(() => {
		process.env.RUNNER_TEMP = '/tmp/runner';
	});

	afterEach(() => {
		vi.resetAllMocks();
		process.env.RUNNER_TEMP = originalRunnerTemp;
	});

	it('should save cache successfully', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockResolvedValue(123);

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		await saveUnifiedCache(versions);

		expect(cache.saveCache).toHaveBeenCalledWith(
			['/tmp/runner/dotnet-cache'],
			expect.stringMatching(/^dotnet-linux-x64-[a-f0-9]{8}$/),
		);
	});

	it('should not throw on cache save error', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockRejectedValue(new Error('Save failed'));

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		await expect(saveUnifiedCache(versions)).resolves.not.toThrow();
	});

	it('should handle ReserveCacheError gracefully', async () => {
		vi.mocked(platformUtils.getPlatform).mockReturnValue('linux');
		vi.mocked(platformUtils.getArchitecture).mockReturnValue('x64');
		vi.mocked(cache.saveCache).mockRejectedValue(
			new Error('ReserveCacheError: Cache already exists'),
		);

		const versions: VersionEntry[] = [{ version: '8.0.100', type: 'sdk' }];

		await expect(saveUnifiedCache(versions)).resolves.not.toThrow();
	});
});
