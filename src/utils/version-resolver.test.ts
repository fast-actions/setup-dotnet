import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareVersions, resolveVersion } from './version-resolver';

describe('compareVersions', () => {
	it('should return 0 for identical versions', () => {
		expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
		expect(compareVersions('10.0.402', '10.0.402')).toBe(0);
	});

	it('should return positive when first version is greater', () => {
		expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
		expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0);
		expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
	});

	it('should return negative when first version is smaller', () => {
		expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
		expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
		expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
	});

	it('should handle versions with different lengths', () => {
		expect(compareVersions('1.0', '1.0.0')).toBe(0);
		expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0);
		expect(compareVersions('1', '1.0.0')).toBe(0);
	});

	it('should handle multi-digit version parts', () => {
		expect(compareVersions('10.0.0', '9.0.0')).toBeGreaterThan(0);
		expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
		expect(compareVersions('1.0.100', '1.0.99')).toBeGreaterThan(0);
	});
});

describe('resolveVersion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return version as-is when no wildcards', async () => {
		const result = await resolveVersion('10.0.0', 'sdk');
		expect(result).toBe('10.0.0');
	});

	it('should resolve wildcard SDK versions', async () => {
		const mockResponse = {
			releases: [
				{
					'channel-version': '10.0',
					'latest-sdk': '10.0.402',
					'latest-runtime': '10.0.2',
				},
				{
					'channel-version': '10.1',
					'latest-sdk': '10.1.100',
					'latest-runtime': '10.1.0',
				},
				{
					'channel-version': '9.0',
					'latest-sdk': '9.0.500',
					'latest-runtime': '9.0.5',
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		});

		const result = await resolveVersion('10.x.x', 'sdk');
		expect(result).toBe('10.1.100');
	});

	it('should resolve wildcard Runtime versions', async () => {
		const mockResponse = {
			releases: [
				{
					'channel-version': '8.0',
					'latest-sdk': '8.0.400',
					'latest-runtime': '8.0.10',
				},
				{
					'channel-version': '8.1',
					'latest-sdk': '8.1.100',
					'latest-runtime': '8.1.0',
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		});

		const result = await resolveVersion('8.x.x', 'runtime');
		expect(result).toBe('8.1.0');
	});

	it('should resolve x.x.x pattern', async () => {
		const mockResponse = {
			releases: [
				{
					'channel-version': '10.0',
					'latest-sdk': '10.0.402',
					'latest-runtime': '10.0.2',
				},
				{
					'channel-version': '9.0',
					'latest-sdk': '9.0.500',
					'latest-runtime': '9.0.5',
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		});

		const result = await resolveVersion('10.0.x', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should throw error when no matching version found', async () => {
		const mockResponse = {
			releases: [
				{
					'channel-version': '10.0',
					'latest-sdk': '10.0.402',
					'latest-runtime': '10.0.2',
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		});

		await expect(resolveVersion('99.x', 'sdk')).rejects.toThrow(
			'No matching version found for pattern: 99.x',
		);
	});

	it('should throw error when fetch fails', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		await expect(resolveVersion('10.x', 'sdk')).rejects.toThrow(
			'Failed to resolve version 10.x: Failed to fetch releases: Not Found',
		);
	});

	it('should throw error when network error occurs', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		await expect(resolveVersion('10.x', 'sdk')).rejects.toThrow(
			'Failed to resolve version 10.x: Network error',
		);
	});
});
