import * as core from '@actions/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallResult } from './installer';
import { installDotNet } from './installer';
import { run } from './main';

vi.mock('@actions/core');
vi.mock('./installer');

describe('main', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
