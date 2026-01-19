import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	compareVersions,
	fetchAndCacheReleaseInfo,
	resetCache,
	resolveVersion,
	setCachedReleases,
} from './version-resolver';

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
		resetCache();
	});

	it('should return version as-is when no wildcards', () => {
		const result = resolveVersion('10.0.0', 'sdk');
		expect(result).toBe('10.0.0');
	});

	it('should resolve wildcard SDK versions', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '10.1',
				'latest-sdk': '10.1.100',
				'latest-runtime': '10.1.0',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('10.x.x', 'sdk');
		expect(result).toBe('10.1.100');
	});

	it('should resolve wildcard Runtime versions', () => {
		setCachedReleases([
			{
				'channel-version': '8.0',
				'latest-sdk': '8.0.400',
				'latest-runtime': '8.0.10',
				'release-type': 'lts',
				'support-phase': 'active',
			},
			{
				'channel-version': '8.1',
				'latest-sdk': '8.1.100',
				'latest-runtime': '8.1.0',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('8.x.x', 'runtime');
		expect(result).toBe('8.1.0');
	});

	it('should resolve x.x.x pattern', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('10.0.x', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should resolve two-part wildcard pattern (10.x)', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '10.1',
				'latest-sdk': '10.1.100',
				'latest-runtime': '10.1.0',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('10.x', 'sdk');
		expect(result).toBe('10.1.100');
	});

	it('should resolve single-part wildcard pattern (10.x) for runtime', () => {
		setCachedReleases([
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.1',
				'latest-sdk': '9.1.200',
				'latest-runtime': '9.1.0',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('9.x', 'runtime');
		expect(result).toBe('9.1.0');
	});

	it('should resolve wildcards with uppercase X', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '10.1',
				'latest-sdk': '10.1.100',
				'latest-runtime': '10.1.0',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		expect(resolveVersion('10.X.X', 'sdk')).toBe('10.1.100');
		expect(resolveVersion('10.0.X', 'sdk')).toBe('10.0.402');
		expect(resolveVersion('10.X', 'sdk')).toBe('10.1.100');
	});

	it('should throw error when no matching version found', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		expect(() => resolveVersion('99.x', 'sdk')).toThrow(
			'No matching version found for pattern: 99.x',
		);
	});

	it('should throw error when cache not initialized', () => {
		expect(() => resolveVersion('10.x', 'sdk')).toThrow(
			'Cache not initialized',
		);
	});

	it('should handle releases-index format', async () => {
		const mockResponse = {
			'releases-index': [
				{
					'channel-version': '10.0',
					'latest-sdk': '10.0.402',
					'latest-runtime': '10.0.2',
					'release-type': 'sts',
					'support-phase': 'active',
				},
				{
					'channel-version': '9.0',
					'latest-sdk': '9.0.500',
					'latest-runtime': '9.0.5',
					'release-type': 'lts',
					'support-phase': 'active',
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		});

		await fetchAndCacheReleaseInfo();

		const result = resolveVersion('10.x.x', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should throw error when fetch fails', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Not Found',
		});

		await expect(fetchAndCacheReleaseInfo()).rejects.toThrow(
			'Failed to fetch releases: Not Found',
		);
	});

	it('should throw error when network error occurs', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		await expect(fetchAndCacheReleaseInfo()).rejects.toThrow('Network error');
	});

	it('should throw error when API response is malformed', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({}),
		});

		await expect(fetchAndCacheReleaseInfo()).rejects.toThrow(
			'Invalid API response: releases data is missing or malformed',
		);
	});

	it('should throw error when API response has null releases', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ releases: null }),
		});

		await expect(fetchAndCacheReleaseInfo()).rejects.toThrow(
			'Invalid API response: releases data is missing or malformed',
		);
	});

	it('should resolve "lts" to latest LTS SDK version', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
			{
				'channel-version': '8.0',
				'latest-sdk': '8.0.404',
				'latest-runtime': '8.0.11',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('lts', 'sdk');
		expect(result).toBe('9.0.500');
	});

	it('should resolve "LTS" (uppercase) to latest LTS SDK version', () => {
		setCachedReleases([
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('LTS', 'sdk');
		expect(result).toBe('9.0.500');
	});

	it('should resolve "sts" to latest STS SDK version', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('sts', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should resolve "lts" for runtime', () => {
		setCachedReleases([
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('lts', 'runtime');
		expect(result).toBe('9.0.5');
	});

	it('should resolve "sts" for aspnetcore', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('sts', 'aspnetcore');
		expect(result).toBe('10.0.2');
	});

	it('should throw error when no LTS releases found', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		expect(() => resolveVersion('lts', 'sdk')).toThrow('No LTS releases found');
	});

	it('should throw error when no STS releases found', () => {
		setCachedReleases([
			{
				'channel-version': '8.0',
				'latest-sdk': '8.0.404',
				'latest-runtime': '8.0.11',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		expect(() => resolveVersion('sts', 'sdk')).toThrow('No STS releases found');
	});

	it('should resolve "latest" to newest SDK version', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
			{
				'channel-version': '8.0',
				'latest-sdk': '8.0.404',
				'latest-runtime': '8.0.11',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('latest', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should resolve "LATEST" (uppercase) to newest SDK version', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('LATEST', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should resolve "latest" for runtime', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('latest', 'runtime');
		expect(result).toBe('10.0.2');
	});

	it('should resolve "latest" for aspnetcore', () => {
		setCachedReleases([
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('latest', 'aspnetcore');
		expect(result).toBe('10.0.2');
	});

	it('should throw error when no releases found for latest', () => {
		setCachedReleases([]);

		expect(() => resolveVersion('latest', 'sdk')).toThrow(
			'No stable releases found',
		);
	});

	it('should skip preview releases when resolving latest', () => {
		setCachedReleases([
			{
				'channel-version': '11.0',
				'latest-sdk': '11.0.100-preview.1',
				'latest-runtime': '11.0.0-preview.1',
				'support-phase': 'preview',
			},
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('latest', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should skip preview releases when resolving lts', () => {
		setCachedReleases([
			{
				'channel-version': '11.0',
				'latest-sdk': '11.0.100-preview.1',
				'latest-runtime': '11.0.0-preview.1',
				'support-phase': 'preview',
			},
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('lts', 'sdk');
		expect(result).toBe('9.0.500');
	});

	it('should skip preview releases when resolving sts', () => {
		setCachedReleases([
			{
				'channel-version': '11.0',
				'latest-sdk': '11.0.100-preview.1',
				'latest-runtime': '11.0.0-preview.1',
				'support-phase': 'preview',
			},
			{
				'channel-version': '10.0',
				'latest-sdk': '10.0.402',
				'latest-runtime': '10.0.2',
				'release-type': 'sts',
				'support-phase': 'active',
			},
			{
				'channel-version': '9.0',
				'latest-sdk': '9.0.500',
				'latest-runtime': '9.0.5',
				'release-type': 'lts',
				'support-phase': 'active',
			},
		]);

		const result = resolveVersion('sts', 'sdk');
		expect(result).toBe('10.0.402');
	});

	it('should throw error when only preview releases exist for latest', () => {
		setCachedReleases([
			{
				'channel-version': '11.0',
				'latest-sdk': '11.0.100-preview.1',
				'latest-runtime': '11.0.0-preview.1',
				'support-phase': 'preview',
			},
		]);

		expect(() => resolveVersion('latest', 'sdk')).toThrow(
			'No stable releases found',
		);
	});

	it('should throw error when only preview LTS releases exist', () => {
		setCachedReleases([
			{
				'channel-version': '11.0',
				'latest-sdk': '11.0.100-preview.1',
				'latest-runtime': '11.0.0-preview.1',
				'release-type': 'lts',
				'support-phase': 'preview',
			},
		]);

		expect(() => resolveVersion('lts', 'sdk')).toThrow('No LTS releases found');
	});
});
