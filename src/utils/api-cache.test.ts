import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearApiCache,
	configureCaching,
	fetchWithCache,
	persistApiCache,
} from './api-cache';

// Mock @actions/cache
vi.mock('@actions/cache', () => ({
	restoreCache: vi.fn(),
	saveCache: vi.fn(),
}));

// Mock @actions/core
vi.mock('@actions/core', () => ({
	debug: vi.fn(),
	warning: vi.fn(),
}));

describe('api-cache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configureCaching(false); // Start with caching disabled
	});

	afterEach(async () => {
		await clearApiCache();
	});

	describe('fetchWithCache', () => {
		it('should fetch without caching when disabled', async () => {
			const mockData = { test: 'data' };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			configureCaching(false);
			const result = await fetchWithCache('https://example.com/api');

			expect(result).toEqual(mockData);
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it('should fetch fresh data on first call with caching enabled', async () => {
			const mockData = { test: 'data' };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			configureCaching(true);
			const result = await fetchWithCache('https://example.com/api');

			expect(result).toEqual(mockData);
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it('should use cached data on second call within 12 hours', async () => {
			const mockData = { test: 'data' };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			configureCaching(true);

			// First call - fetch fresh
			const result1 = await fetchWithCache('https://example.com/api');
			expect(result1).toEqual(mockData);
			expect(global.fetch).toHaveBeenCalledTimes(1);

			// Second call - should use cache
			const result2 = await fetchWithCache('https://example.com/api');
			expect(result2).toEqual(mockData);
			expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, not called again
		});

		it('should handle different URLs separately', async () => {
			const mockData1 = { test: 'data1' };
			const mockData2 = { test: 'data2' };

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockData1,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockData2,
				});

			configureCaching(true);

			const result1 = await fetchWithCache('https://example.com/api1');
			const result2 = await fetchWithCache('https://example.com/api2');

			expect(result1).toEqual(mockData1);
			expect(result2).toEqual(mockData2);
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		it('should throw error when fetch fails', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: 'Not Found',
			});

			configureCaching(true);

			await expect(fetchWithCache('https://example.com/api')).rejects.toThrow(
				'API request failed: 404 Not Found',
			);
		});
	});

	describe('configureCaching', () => {
		it('should enable caching', () => {
			configureCaching(true);
			// No error thrown, caching is enabled internally
		});

		it('should disable caching', () => {
			configureCaching(false);
			// No error thrown, caching is disabled internally
		});
	});

	describe('persistApiCache', () => {
		it('should not throw when called', async () => {
			configureCaching(true);
			await expect(persistApiCache()).resolves.not.toThrow();
		});
	});

	describe('clearApiCache', () => {
		it('should clear cache without errors', async () => {
			configureCaching(true);

			const mockData = { test: 'data' };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockData,
			});

			await fetchWithCache('https://example.com/api');
			await clearApiCache();

			// After clearing, should fetch fresh data
			await fetchWithCache('https://example.com/api');
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});
	});
});
