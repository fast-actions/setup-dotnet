import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDotNetDownloadInfo, releasesCache } from './installer';
import * as platformUtils from './utils/platform-utils';

// Mock fetch globally
global.fetch = vi.fn();

describe('getDotNetDownloadInfo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Clear releases cache to prevent test interference
		releasesCache.clear();
		// Mock platform to linux-x64 for consistent tests
		vi.spyOn(platformUtils, 'getPlatform').mockReturnValue('linux');
		vi.spyOn(platformUtils, 'getArchitecture').mockReturnValue('x64');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should fetch download info from releases API for SDK', async () => {
		const mockResponse = {
			releases: [
				{
					sdk: {
						version: '8.0.100',
						files: [
							{
								name: 'dotnet-sdk-linux-x64.tar.gz',
								rid: 'linux-x64',
								url: 'https://builds.dotnet.microsoft.com/dotnet/Sdk/8.0.100/dotnet-sdk-8.0.100-linux-x64.tar.gz',
								hash: 'abc123def456',
							},
						],
					},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const result = await getDotNetDownloadInfo('8.0.100', 'sdk');

		expect(result.url).toContain('dotnet-sdk-8.0.100');
		expect(result.hash).toBe('abc123def456');
		expect(fetch).toHaveBeenCalledWith(
			'https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json',
		);
	});

	it('should fetch download info from releases API for Runtime', async () => {
		const mockResponse = {
			releases: [
				{
					runtime: {
						version: '7.0.15',
						files: [
							{
								name: 'dotnet-runtime-linux-x64.tar.gz',
								rid: 'linux-x64',
								url: 'https://builds.dotnet.microsoft.com/dotnet/Runtime/7.0.15/dotnet-runtime-7.0.15-linux-x64.tar.gz',
								hash: 'xyz789abc123',
							},
						],
					},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const result = await getDotNetDownloadInfo('7.0.15', 'runtime');

		expect(result.url).toContain('dotnet-runtime-7.0.15');
		expect(result.hash).toBe('xyz789abc123');
	});

	it('should fetch download info from releases API for ASP.NET Core', async () => {
		const mockResponse = {
			releases: [
				{
					'aspnetcore-runtime': {
						version: '8.0.0',
						files: [
							{
								name: 'aspnetcore-runtime-linux-x64.tar.gz',
								rid: 'linux-x64',
								url: 'https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/8.0.0/aspnetcore-runtime-8.0.0-linux-x64.tar.gz',
								hash: 'def456ghi789',
							},
						],
					},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const result = await getDotNetDownloadInfo('8.0.0', 'aspnetcore');

		expect(result.url).toContain('aspnetcore-runtime-8.0.0');
		expect(result.hash).toBe('def456ghi789');
	});

	it('should throw error when version not found', async () => {
		const mockResponse = {
			releases: [],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		await expect(getDotNetDownloadInfo('99.0.0', 'sdk')).rejects.toThrow(
			'Version 99.0.0 not found in releases manifest',
		);
	});

	it('should throw error when hash is missing', async () => {
		const mockResponse = {
			releases: [
				{
					sdk: {
						version: '8.0.100',
						files: [
							{
								name: 'dotnet-sdk-linux-x64.tar.gz',
								rid: 'linux-x64',
								url: 'https://builds.dotnet.microsoft.com/dotnet/Sdk/8.0.100/dotnet-sdk-8.0.100-linux-x64.tar.gz',
								hash: '',
							},
						],
					},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		await expect(getDotNetDownloadInfo('8.0.100', 'sdk')).rejects.toThrow(
			'Hash missing for sdk 8.0.100',
		);
	});

	it('should cache API responses to prevent duplicate requests', async () => {
		const mockResponse = {
			releases: [
				{
					sdk: {
						version: '8.0.100',
						files: [
							{
								name: 'dotnet-sdk-linux-x64.tar.gz',
								rid: 'linux-x64',
								url: 'https://builds.dotnet.microsoft.com/dotnet/Sdk/8.0.100/dotnet-sdk-8.0.100-linux-x64.tar.gz',
								hash: 'cached123',
							},
						],
					},
				},
			],
		};

		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		// Make multiple concurrent requests
		await Promise.all([
			getDotNetDownloadInfo('8.0.100', 'sdk'),
			getDotNetDownloadInfo('8.0.100', 'sdk'),
			getDotNetDownloadInfo('8.0.100', 'sdk'),
		]);

		// Should only fetch once due to caching
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

describe('getDotNetInstallDirectory', () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		vi.resetModules();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it('should use RUNNER_TOOL_CACHE when available', async () => {
		process.env.RUNNER_TOOL_CACHE = '/custom/toolcache';
		delete process.env.AGENT_TOOLSDIRECTORY;

		const { getDotNetInstallDirectory } = await import('./installer');
		const dir = (getDotNetInstallDirectory as () => string)();

		expect(dir).toBe('/custom/toolcache/dotnet');
	});

	it('should use AGENT_TOOLSDIRECTORY when available', async () => {
		process.env.AGENT_TOOLSDIRECTORY = '/azure/tools';
		delete process.env.RUNNER_TOOL_CACHE;

		vi.resetModules();
		const { getDotNetInstallDirectory } = await import('./installer');
		const dir = (getDotNetInstallDirectory as () => string)();

		expect(dir).toBe('/azure/tools/dotnet');
	});

	it('should throw error when neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE is set', async () => {
		delete process.env.RUNNER_TOOL_CACHE;
		delete process.env.AGENT_TOOLSDIRECTORY;

		vi.resetModules();
		const { getDotNetInstallDirectory } = await import('./installer');

		expect(() => (getDotNetInstallDirectory as () => string)()).toThrow(
			'Neither AGENT_TOOLSDIRECTORY nor RUNNER_TOOL_CACHE environment variable is set',
		);
	});
});
