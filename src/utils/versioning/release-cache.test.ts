import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseManifest } from '../../types';
import { clearReleaseCache, fetchReleaseManifest } from './release-cache';

describe('fetchReleaseManifest', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
		clearReleaseCache();
	});

	afterEach(() => {
		vi.useRealTimers();
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

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		const result = await fetchReleaseManifest('8.0.100');

		expect(result).toEqual(mockManifest);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json',
			expect.objectContaining({ signal: expect.anything() }),
		);
	});

	it('should cache manifest for same channel', async () => {
		const mockManifest: ReleaseManifest = {
			releases: [{ sdks: [{ version: '8.0.100' }] }],
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		await Promise.all([
			fetchReleaseManifest('8.0.100'),
			fetchReleaseManifest('8.0.200'),
		]);

		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it('should throw error for invalid version', async () => {
		await expect(fetchReleaseManifest('invalid')).rejects.toThrow(
			'Invalid version format',
		);
	});

	it('should throw error when fetch fails', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		await expect(fetchReleaseManifest('8.0.100')).rejects.toThrow(
			'Failed to fetch releases',
		);
	});

	it('should not cache a failed fetch and refetch on the next call', async () => {
		vi.useFakeTimers();
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

		const failing = fetchReleaseManifest('8.0.100');
		const expectation = expect(failing).rejects.toThrow();
		await vi.runAllTimersAsync();
		await expectation;
		vi.useRealTimers();

		const mockManifest: ReleaseManifest = {
			releases: [{ sdks: [{ version: '8.0.100' }] }],
		};
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		const result = await fetchReleaseManifest('8.0.100');

		expect(result).toEqual(mockManifest);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
	});

	it('should clear cache', async () => {
		const mockManifest: ReleaseManifest = {
			releases: [{ sdks: [{ version: '8.0.100' }] }],
		};

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockManifest,
		});

		await fetchReleaseManifest('8.0.100');
		clearReleaseCache();
		await fetchReleaseManifest('8.0.100');

		expect(globalThis.fetch).toHaveBeenCalledTimes(2);
	});
});
