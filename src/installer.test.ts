import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as fsModule from 'node:fs';
import {
	downloadToCache,
	getArchivePath,
	getDotNetDownloadInfo,
	installFromArchive,
} from './installer';
import * as platformUtils from './utils/platform-utils';
import { clearReleaseCache } from './utils/versioning/release-cache';

// Mock fetch globally
globalThis.fetch = vi.fn();

// Mock fs and io modules
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('@actions/io');
vi.mock('@actions/tool-cache');
vi.mock('./utils/archive-utils');

describe('getDotNetDownloadInfo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Clear releases cache to prevent test interference
		clearReleaseCache();
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
					sdks: [
						{
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
					],
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
					sdks: [
						{
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
					],
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
					sdks: [
						{
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
					],
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

describe('getArchivePath', () => {
	beforeEach(() => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.spyOn(platformUtils, 'getPlatform').mockReturnValue('linux');
		vi.spyOn(platformUtils, 'getArchitecture').mockReturnValue('x64');
	});

	afterEach(() => {
		delete process.env.RUNNER_TOOL_CACHE;
		vi.restoreAllMocks();
	});

	it('should generate archive path for SDK', () => {
		const path = getArchivePath('sdk', '8.0.100');

		expect(path).toBe(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-linux-x64.tar.gz',
		);
	});

	it('should generate archive path for runtime', () => {
		const path = getArchivePath('runtime', '7.0.15');

		expect(path).toBe(
			'/runner/tool-cache/dotnet-archives/runtime-7.0.15-linux-x64.tar.gz',
		);
	});

	it('should generate archive path for aspnetcore', () => {
		const path = getArchivePath('aspnetcore', '8.0.0');

		expect(path).toBe(
			'/runner/tool-cache/dotnet-archives/aspnetcore-8.0.0-linux-x64.tar.gz',
		);
	});

	it('should use .zip extension on Windows', () => {
		vi.spyOn(platformUtils, 'getPlatform').mockReturnValue('win');

		const path = getArchivePath('sdk', '8.0.100');

		expect(path).toBe(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-win-x64.zip',
		);
	});
});

describe('downloadToCache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearReleaseCache();
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.spyOn(platformUtils, 'getPlatform').mockReturnValue('linux');
		vi.spyOn(platformUtils, 'getArchitecture').mockReturnValue('x64');
	});

	afterEach(() => {
		delete process.env.RUNNER_TOOL_CACHE;
		vi.restoreAllMocks();
	});

	it('should return existing archive path if already cached', async () => {
		const fs = await import('node:fs');
		vi.spyOn(fs, 'existsSync').mockReturnValue(true);

		const archivePath = await downloadToCache('8.0.100', 'sdk');

		expect(archivePath).toBe(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-linux-x64.tar.gz',
		);
		expect(fs.existsSync).toHaveBeenCalledWith(archivePath);
	});

	it('should download and cache archive if not already cached', async () => {
		const fs = await import('node:fs');
		const io = await import('@actions/io');
		const toolCache = await import('@actions/tool-cache');

		vi.spyOn(fs, 'existsSync').mockReturnValue(false);
		vi.spyOn(fs, 'statSync').mockReturnValue({
			size: 1024 * 1024,
		} as fsModule.Stats);
		vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('test'));
		vi.spyOn(io, 'mkdirP').mockResolvedValue(undefined);
		vi.spyOn(io, 'mv').mockResolvedValue(undefined);
		vi.spyOn(toolCache, 'downloadTool').mockResolvedValue(
			'/tmp/download.tar.gz',
		);

		const mockResponse = {
			releases: [
				{
					sdks: [
						{
							version: '8.0.100',
							files: [
								{
									name: 'dotnet-sdk-linux-x64.tar.gz',
									rid: 'linux-x64',
									url: 'https://example.com/sdk.tar.gz',
									hash: 'EE26B0DD4AF7E749AA1A8EE3C10AE9923F618980772E473F8819A5D4940E0DB27AC185F8A0E1D5F84F88BC887FD67B143732C304CC5FA9AD8E6F57F50028A8FF',
								},
							],
						},
					],
				},
			],
		};

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const archivePath = await downloadToCache('8.0.100', 'sdk');

		expect(archivePath).toBe(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-linux-x64.tar.gz',
		);
		expect(toolCache.downloadTool).toHaveBeenCalledWith(
			'https://example.com/sdk.tar.gz',
		);
		expect(io.mkdirP).toHaveBeenCalledWith(
			'/runner/tool-cache/dotnet-archives',
		);
		expect(io.mv).toHaveBeenCalledWith('/tmp/download.tar.gz', archivePath);
	});
});

describe('installFromArchive', () => {
	beforeEach(() => {
		process.env.RUNNER_TOOL_CACHE = '/runner/tool-cache';
		vi.spyOn(platformUtils, 'getPlatform').mockReturnValue('linux');
		vi.spyOn(platformUtils, 'getArchitecture').mockReturnValue('x64');
	});

	afterEach(() => {
		delete process.env.RUNNER_TOOL_CACHE;
		vi.restoreAllMocks();
	});

	it('should extract archive and install to directory', async () => {
		const fs = await import('node:fs');
		const io = await import('@actions/io');
		const archiveUtils = await import('./utils/archive-utils');

		vi.spyOn(archiveUtils, 'extractArchive').mockResolvedValue(
			'/tmp/extracted',
		);
		vi.spyOn(fs, 'existsSync').mockReturnValue(true);
		vi.spyOn(io, 'mkdirP').mockResolvedValue(undefined);
		vi.spyOn(io, 'cp').mockResolvedValue(undefined);

		const result = await installFromArchive(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-linux-x64.tar.gz',
			'8.0.100',
			'sdk',
		);

		expect(result.version).toBe('8.0.100');
		expect(result.type).toBe('sdk');
		expect(result.path).toBe('/runner/tool-cache/dotnet');
		expect(archiveUtils.extractArchive).toHaveBeenCalledWith(
			'/runner/tool-cache/dotnet-archives/sdk-8.0.100-linux-x64.tar.gz',
			'tar.gz',
		);
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
