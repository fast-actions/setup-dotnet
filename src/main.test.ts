import * as core from '@actions/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallResult } from './installer';
import { installDotNet } from './installer';
import { run } from './main';
import * as cacheUtils from './utils/cache-utils';

vi.mock('@actions/core');
vi.mock('./installer');
vi.mock('./utils/cache-utils');

describe('main', () => {
	const testDir = path.join(__dirname, '__test_main__');
	const testGlobalJson = path.join(testDir, 'global.json');

	beforeEach(async () => {
		vi.clearAllMocks();
		await fs.mkdir(testDir, { recursive: true });

		// Mock cache utilities - default to cache miss
		vi.mocked(cacheUtils.generateCacheKey).mockReturnValue(
			'dotnet-test-cache-key',
		);
		vi.mocked(cacheUtils.restoreCache).mockResolvedValue(false);
		vi.mocked(cacheUtils.saveCache).mockResolvedValue(undefined);
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should install SDK when dotnet-sdk input is provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-sdk') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.0',
			type: 'sdk',
		});
		expect(core.setOutput).toHaveBeenCalledWith('dotnet-version', 'sdk:10.0.0');
		expect(core.setOutput).toHaveBeenCalledWith('dotnet-path', '/path/to/sdk');
	});

	it('should install Runtime when dotnet-runtime input is provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-runtime') return '8.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '8.0.0',
			type: 'runtime',
			path: '/path/to/runtime',
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '8.0.0',
			type: 'runtime',
		});
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-version',
			'runtime:8.0.0',
		);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/runtime',
		);
	});

	it('should install both SDK and Runtime when both inputs provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-sdk') return '10.0.0';
			if (name === 'dotnet-runtime') return '8.0.0';
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '10.0.0',
				type: 'sdk',
				path: '/path/to/sdk',
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '8.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledTimes(2);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-version',
			'sdk:10.0.0, runtime:8.0.0',
		);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/sdk:/path/to/runtime',
		);
	});

	it('should fail when neither SDK nor Runtime specified', async () => {
		vi.mocked(core.getInput).mockReturnValue('');

		await run();

		expect(core.setFailed).toHaveBeenCalledWith(
			'At least one of dotnet-sdk, dotnet-runtime, or dotnet-aspnetcore must be specified',
		);
	});

	it('should handle installation errors', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-sdk') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockRejectedValue(new Error('Download failed'));

		await run();

		expect(core.setFailed).toHaveBeenCalledWith('Download failed');
	});

	it('should handle unknown errors', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-sdk') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockRejectedValue('Unknown error');

		await run();

		expect(core.setFailed).toHaveBeenCalledWith('An unknown error occurred');
	});

	it('should use SDK version from global.json when no dotnet-sdk input', async () => {
		const globalJson = {
			sdk: {
				version: '9.0.100',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-runtime') return '8.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '9.0.100',
				type: 'sdk',
				path: '/path/to/sdk',
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '8.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '9.0.100',
			type: 'sdk',
		});
		expect(installDotNet).toHaveBeenCalledWith({
			version: '8.0.0',
			type: 'runtime',
		});
	});

	it('should prioritize dotnet-sdk input over global.json', async () => {
		const globalJson = {
			sdk: {
				version: '9.0.100',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-sdk') return '10.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.0',
			type: 'sdk',
		});
	});

	it('should use custom global.json path when provided', async () => {
		const customGlobalJson = path.join(testDir, 'custom', 'global.json');
		await fs.mkdir(path.dirname(customGlobalJson), { recursive: true });
		const globalJson = {
			sdk: {
				version: '7.0.100',
			},
		};
		await fs.writeFile(customGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'global-json') return customGlobalJson;
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '7.0.100',
			type: 'sdk',
			path: '/path/to/sdk',
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '7.0.100',
			type: 'sdk',
		});
	});

	it('should apply rollForward policy from global.json', async () => {
		const globalJson = {
			sdk: {
				version: '8.0.100',
				rollForward: 'latestMinor',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '8.0.417',
			type: 'sdk',
			path: '/path/to/sdk',
		} as InstallResult);

		await run();

		// Should have resolved 8.x.x wildcard to a concrete version
		expect(installDotNet).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'sdk',
				version: expect.stringMatching(/^8\.\d+\.\d+$/),
			}),
		);
	});

	it('should install runtime independently of global.json', async () => {
		const globalJson = {
			sdk: {
				version: '9.0.100',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'dotnet-runtime') return '7.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '9.0.100',
				type: 'sdk',
				path: '/path/to/sdk',
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '7.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '9.0.100',
			type: 'sdk',
		});
		expect(installDotNet).toHaveBeenCalledWith({
			version: '7.0.0',
			type: 'runtime',
		});
	});
});
