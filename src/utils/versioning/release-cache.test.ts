import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseManifest } from '../../types';
import { clearReleaseCache, fetchReleaseManifest } from './release-cache';

describe('fetchReleaseManifest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearReleaseCache();
	});

	it('should fetch release manifest', async () => {
		const mockManifest: ReleaseManifest = {
			releases: [
				{
					sdks: [{ version: '8.0.100' }],
					runtime: { version: '8.0.0' },
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		const result = await fetchReleaseManifest('8.0.100');

		expect(result).toEqual(mockManifest);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json',
		);
	});

	it('should cache manifest for same channel', async () => {
		const mockManifest: ReleaseManifest = {
			releases: [{ sdks: [{ version: '8.0.100' }] }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		await Promise.all([
			fetchReleaseManifest('8.0.100'),
			fetchReleaseManifest('8.0.200'),
		]);

		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('should throw error for invalid version', async () => {
		await expect(fetchReleaseManifest('invalid')).rejects.toThrow(
			'Invalid version format',
		);
	});

	it('should throw error when fetch fails', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		await expect(fetchReleaseManifest('8.0.100')).rejects.toThrow(
			'API request failed',
		);
	});

	it('should clear cache', async () => {
		const mockManifest: ReleaseManifest = {
			releases: [{ sdks: [{ version: '8.0.100' }] }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		await fetchReleaseManifest('8.0.100');
		clearReleaseCache();
		await fetchReleaseManifest('8.0.100');

		expect(global.fetch).toHaveBeenCalledTimes(2);
	});
});
