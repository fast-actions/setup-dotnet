import * as core from '@actions/core';
import * as toolCache from '@actions/tool-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCacheKey, setupCache } from './cache';

vi.mock('@actions/core');
vi.mock('@actions/tool-cache');

describe('setupCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return cache hit when cached installation is found', async () => {
		const mockPath = '/opt/hostedtoolcache/dotnet-sdk/10.0.102/x64';
		vi.mocked(toolCache.find).mockReturnValue(mockPath);

		const result = await setupCache('10.0.102', 'sdk');

		expect(result).toEqual({
			hit: true,
			path: mockPath,
		});
		expect(toolCache.find).toHaveBeenCalledWith('dotnet-sdk', '10.0.102');
		expect(core.addPath).toHaveBeenCalledWith(mockPath);
		expect(core.info).toHaveBeenCalledWith('Cache hit for sdk 10.0.102');
	});

	it('should return cache miss when no cached installation is found', async () => {
		vi.mocked(toolCache.find).mockReturnValue('');

		const result = await setupCache('10.0.102', 'sdk');

		expect(result).toEqual({
			hit: false,
			path: '',
		});
		expect(toolCache.find).toHaveBeenCalledWith('dotnet-sdk', '10.0.102');
		expect(core.addPath).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith('Cache miss for sdk 10.0.102');
	});

	it('should use correct cache key for runtime', async () => {
		vi.mocked(toolCache.find).mockReturnValue('');

		await setupCache('8.0.10', 'runtime');

		expect(toolCache.find).toHaveBeenCalledWith('dotnet-runtime', '8.0.10');
	});

	it('should log debug information', async () => {
		vi.mocked(toolCache.find).mockReturnValue('');

		await setupCache('10.0.102', 'sdk');

		expect(core.debug).toHaveBeenCalledWith(
			"Cache lookup: key='dotnet-sdk', version='10.0.102'",
		);
		expect(core.debug).toHaveBeenCalledWith(
			expect.stringContaining('Platform:'),
		);
	});
});

describe('generateCacheKey', () => {
	it('should generate correct cache key for SDK', () => {
		const key = generateCacheKey('10.0.102', 'sdk');

		expect(key).toMatch(/^dotnet-sdk-10\.0\.102-/);
		expect(key).toContain('-v1');
	});

	it('should generate correct cache key for runtime', () => {
		const key = generateCacheKey('8.0.10', 'runtime');

		expect(key).toMatch(/^dotnet-runtime-8\.0\.10-/);
		expect(key).toContain('-v1');
	});

	it('should include platform and architecture in cache key', () => {
		const key = generateCacheKey('10.0.102', 'sdk');

		// Should contain platform (darwin, linux, win32) and arch (x64, arm64, etc.)
		expect(key).toMatch(/-(darwin|linux|win32)-/);
		expect(key).toMatch(/-(x64|arm64|arm)-/);
	});
});
