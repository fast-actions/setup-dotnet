import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sdkRuntimeMapper from './sdk-runtime-mapper';

describe('getSdkIncludedVersions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return runtime and aspnetcore versions for valid SDK', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				releases: [
					{
						sdk: { version: '7.0.100' },
						runtime: { version: '7.0.0' },
						aspnetcore: { version: '7.0.0' },
					},
				],
			}),
		});

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('7.0.100');

		expect(result).toEqual({
			runtime: '7.0.0',
			aspnetcore: '7.0.0',
		});
	});

	it('should return null for SDK not found in releases', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				releases: [
					{
						sdk: { version: '7.0.100' },
						runtime: { version: '7.0.0' },
					},
				],
			}),
		});

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('8.0.100');

		expect(result).toEqual({
			runtime: null,
			aspnetcore: null,
		});
	});

	it('should handle API errors gracefully', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('7.0.100');

		expect(result).toEqual({
			runtime: null,
			aspnetcore: null,
		});
	});

	it('should handle invalid SDK version format', async () => {
		const result = await sdkRuntimeMapper.getSdkIncludedVersions('invalid');

		expect(result).toEqual({
			runtime: null,
			aspnetcore: null,
		});
	});

	it('should extract correct channel from SDK version', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				releases: [
					{
						sdk: { version: '8.0.302' },
						runtime: { version: '8.0.6' },
						aspnetcore: { version: '8.0.6' },
					},
				],
			}),
		});

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('8.0.302');

		expect(result).toEqual({
			runtime: '8.0.6',
			aspnetcore: '8.0.6',
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/8.0/releases.json',
		);
	});

	it('should handle SDK with runtime but no aspnetcore', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				releases: [
					{
						sdk: { version: '7.0.100' },
						runtime: { version: '7.0.0' },
					},
				],
			}),
		});

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('7.0.100');

		expect(result).toEqual({
			runtime: '7.0.0',
			aspnetcore: null,
		});
	});

	it('should handle network errors', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await sdkRuntimeMapper.getSdkIncludedVersions('7.0.100');

		expect(result).toEqual({
			runtime: null,
			aspnetcore: null,
		});
	});
});
