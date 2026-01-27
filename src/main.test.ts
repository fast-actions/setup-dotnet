import * as core from '@actions/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallResult } from './installer';
import { getDotNetInstallDirectory, installDotNet } from './installer';
import { run } from './main';
import * as dotnetDetector from './utils/dotnet-detector';

vi.mock('@actions/core');
vi.mock('./installer');
vi.mock('./utils/dotnet-detector');

describe('main', () => {
	const testDir = path.join(__dirname, '__test_main__');
	const testGlobalJson = path.join(testDir, 'global.json');

	beforeEach(async () => {
		vi.clearAllMocks();
		await fs.mkdir(testDir, { recursive: true });

		// Mock getDotNetInstallDirectory
		vi.mocked(getDotNetInstallDirectory).mockReturnValue('/path/to/dotnet');

		// Mock getBooleanInput - default to false for cache and allow-preview
		vi.mocked(core.getBooleanInput).mockReturnValue(false);

		// Mock dotnet detector - default to no installed versions
		vi.mocked(dotnetDetector.getInstalledVersions).mockResolvedValue({
			sdk: [],
			runtime: [],
			aspnetcore: [],
		});
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should install SDK when sdk-version input is provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
			cacheHit: false,
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.0',
			type: 'sdk',
			cacheEnabled: false,
		});
		expect(core.setOutput).toHaveBeenCalledWith('dotnet-version', 'sdk:10.0.0');
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/dotnet',
		);
	});

	it('should install Runtime when runtime-version input is provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'runtime-version') return '8.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '8.0.0',
			type: 'runtime',
			path: '/path/to/runtime',
			cacheHit: false,
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '8.0.0',
			type: 'runtime',
			cacheEnabled: false,
		});
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-version',
			'runtime:8.0.0',
		);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/dotnet',
		);
	});

	it('should install both SDK and Runtime when both inputs provided', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			if (name === 'runtime-version') return '8.0.0';
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '10.0.0',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: false,
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '8.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
				cacheHit: false,
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledTimes(2);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-version',
			'sdk:10.0.0, runtime:8.0.0',
		);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/dotnet',
		);
	});

	it('should fail when neither SDK nor Runtime specified', async () => {
		vi.mocked(core.getInput).mockReturnValue('');

		await run();

		expect(core.setFailed).toHaveBeenCalledWith(
			'At least one of sdk-version, runtime-version, or aspnetcore-version must be specified',
		);
	});

	it('should handle installation errors', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockRejectedValue(new Error('Download failed'));

		await run();

		expect(core.setFailed).toHaveBeenCalledWith('Download failed');
	});

	it('should handle unknown errors', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(installDotNet).mockRejectedValue('Unknown error');

		await run();

		expect(core.setFailed).toHaveBeenCalledWith('An unknown error occurred');
	});

	it('should use SDK version from global.json when no sdk-version input', async () => {
		const globalJson = {
			sdk: {
				version: '9.0.100',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'runtime-version') return '8.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '9.0.100',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: false,
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '8.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
				cacheHit: false,
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '9.0.100',
			type: 'sdk',
			cacheEnabled: false,
		});
		expect(installDotNet).toHaveBeenCalledWith({
			version: '8.0.0',
			type: 'runtime',
			cacheEnabled: false,
		});
	});

	it('should prioritize sdk-version input over global.json', async () => {
		const globalJson = {
			sdk: {
				version: '9.0.100',
			},
		};
		await fs.writeFile(testGlobalJson, JSON.stringify(globalJson), 'utf-8');

		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
			cacheHit: false,
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.0',
			type: 'sdk',
			cacheEnabled: false,
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
			cacheHit: false,
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '7.0.100',
			type: 'sdk',
			cacheEnabled: false,
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
			cacheHit: false,
		} as InstallResult);

		await run();

		// Should have resolved 8.x.x wildcard to a concrete version
		expect(installDotNet).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'sdk',
				version: expect.stringMatching(/^8\.\d+\.\d+$/),
				cacheEnabled: false,
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
			if (name === 'runtime-version') return '7.0.0';
			if (name === 'global-json') return testGlobalJson;
			return '';
		});
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '9.0.100',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: false,
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '7.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
				cacheHit: false,
			} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '9.0.100',
			type: 'sdk',
			cacheEnabled: false,
		});
		expect(installDotNet).toHaveBeenCalledWith({
			version: '7.0.0',
			type: 'runtime',
			cacheEnabled: false,
		});
	});

	it('should skip installation when all versions already installed', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.402';
			return '';
		});
		vi.mocked(dotnetDetector.getInstalledVersions).mockResolvedValue({
			sdk: ['10.0.402'],
			runtime: [],
			aspnetcore: [],
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(true);

		await run();

		expect(installDotNet).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(
			'✅ All requested versions are already installed on the system',
		);
	});

	it('should skip installation when all runtime versions already installed', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'runtime-version') return '8.0.23';
			return '';
		});
		vi.mocked(dotnetDetector.getInstalledVersions).mockResolvedValue({
			sdk: [],
			runtime: ['8.0.23'],
			aspnetcore: [],
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(true);

		await run();

		expect(installDotNet).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(
			'✅ All requested versions are already installed on the system',
		);
	});

	it('should install all versions when at least one is not installed', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.402, 9.0.500';
			return '';
		});
		// Only 9.0.500 is installed, so we need to install BOTH versions
		vi.mocked(dotnetDetector.getInstalledVersions).mockResolvedValue({
			sdk: ['9.0.500'],
			runtime: [],
			aspnetcore: [],
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockImplementation(
			(version: string) => version === '9.0.500',
		);
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '10.0.402',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: false,
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '9.0.500',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: false,
			} as InstallResult);

		await run();

		// Should install BOTH versions since one is missing
		expect(installDotNet).toHaveBeenCalledTimes(2);
		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.402',
			type: 'sdk',
			cacheEnabled: false,
		});
		expect(installDotNet).toHaveBeenCalledWith({
			version: '9.0.500',
			type: 'sdk',
			cacheEnabled: false,
		});
		expect(core.info).toHaveBeenCalledWith(
			'At least one requested version is not installed on the system',
		);
	});

	it('should skip installation when all aspnetcore versions already installed', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'aspnetcore-version') return '8.0.23';
			return '';
		});
		vi.mocked(dotnetDetector.getInstalledVersions).mockResolvedValue({
			sdk: [],
			runtime: [],
			aspnetcore: ['8.0.23'],
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(true);

		await run();

		expect(installDotNet).not.toHaveBeenCalled();
		expect(core.info).toHaveBeenCalledWith(
			'✅ All requested versions are already installed on the system',
		);
	});

	it('should pass cacheEnabled to installDotNet when cache input is true', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(core.getBooleanInput).mockImplementation((name: string) => {
			if (name === 'cache') return true;
			return false;
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(false);
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
			cacheHit: true,
		} as InstallResult);

		await run();

		expect(installDotNet).toHaveBeenCalledWith({
			version: '10.0.0',
			type: 'sdk',
			cacheEnabled: true,
		});
	});

	it('should set cache-hit output to "true" when all cache hits', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(false);
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
			cacheHit: true,
		} as InstallResult);

		await run();

		expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
	});

	it('should set cache-hit output to "partial" when some cache hits', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			if (name === 'runtime-version') return '8.0.0';
			return '';
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(false);
		vi.mocked(installDotNet)
			.mockResolvedValueOnce({
				version: '10.0.0',
				type: 'sdk',
				path: '/path/to/sdk',
				cacheHit: true,
			} as InstallResult)
			.mockResolvedValueOnce({
				version: '8.0.0',
				type: 'runtime',
				path: '/path/to/runtime',
				cacheHit: false,
			} as InstallResult);

		await run();

		expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'partial');
	});

	it('should set cache-hit output to "false" when no cache hits', async () => {
		vi.mocked(core.getInput).mockImplementation((name: string) => {
			if (name === 'sdk-version') return '10.0.0';
			return '';
		});
		vi.mocked(dotnetDetector.isVersionInstalled).mockReturnValue(false);
		vi.mocked(installDotNet).mockResolvedValue({
			version: '10.0.0',
			type: 'sdk',
			path: '/path/to/sdk',
			cacheHit: false,
		} as InstallResult);

		await run();

		expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
	});
});
