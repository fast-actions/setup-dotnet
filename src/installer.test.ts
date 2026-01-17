import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDotNetDownloadUrl } from './installer';

describe('getDotNetDownloadUrl', () => {
	it('should generate correct SDK URL', () => {
		const url = getDotNetDownloadUrl('8.0.100', 'sdk');
		expect(url).toMatch(
			/^https:\/\/builds\.dotnet\.microsoft\.com\/dotnet\/Sdk\/8\.0\.100\/dotnet-sdk-8\.0\.100-(linux|osx|win)-(x64|arm64|arm)\.(tar\.gz|zip)$/,
		);
	});

	it('should generate correct Runtime URL', () => {
		const url = getDotNetDownloadUrl('7.0.15', 'runtime');
		expect(url).toMatch(
			/^https:\/\/builds\.dotnet\.microsoft\.com\/dotnet\/Runtime\/7\.0\.15\/dotnet-runtime-7\.0\.15-(linux|osx|win)-(x64|arm64|arm)\.(tar\.gz|zip)$/,
		);
	});

	it('should generate correct ASP.NET Core URL', () => {
		const url = getDotNetDownloadUrl('8.0.0', 'aspnetcore');
		expect(url).toMatch(
			/^https:\/\/builds\.dotnet\.microsoft\.com\/dotnet\/aspnetcore\/Runtime\/8\.0\.0\/aspnetcore-runtime-8\.0\.0-(linux|osx|win)-(x64|arm64|arm)\.(tar\.gz|zip)$/,
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
