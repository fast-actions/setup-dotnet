import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './fetch-with-retry';

describe('fetchWithRetry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should retry on a network error and succeed', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error('network down'))
			.mockRejectedValueOnce(new Error('network down'))
			.mockResolvedValueOnce({ ok: true, status: 200 });
		globalThis.fetch = fetchMock;

		const response = await fetchWithRetry('https://example.com', {
			retries: 3,
			backoffMs: 0,
		});

		expect(response.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('should throw after exhausting all retries', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
		globalThis.fetch = fetchMock;

		await expect(
			fetchWithRetry('https://example.com', { retries: 3, backoffMs: 0 }),
		).rejects.toThrow('network down');
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('should retry on a 5xx response', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 503 })
			.mockResolvedValueOnce({ ok: true, status: 200 });
		globalThis.fetch = fetchMock;

		const response = await fetchWithRetry('https://example.com', {
			retries: 3,
			backoffMs: 0,
		});

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('should retry on a 429 response', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 429 })
			.mockResolvedValueOnce({ ok: true, status: 200 });
		globalThis.fetch = fetchMock;

		const response = await fetchWithRetry('https://example.com', {
			retries: 3,
			backoffMs: 0,
		});

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('should not retry on a 4xx response', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
		globalThis.fetch = fetchMock;

		const response = await fetchWithRetry('https://example.com', {
			retries: 3,
			backoffMs: 0,
		});

		expect(response.status).toBe(404);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('should abort a request that exceeds the timeout', async () => {
		vi.useFakeTimers();
		globalThis.fetch = vi.fn(
			(
				_input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			): Promise<Response> =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(new Error('The operation was aborted')),
					);
				}),
		);

		const promise = fetchWithRetry('https://example.com', {
			retries: 1,
			timeoutMs: 1000,
			backoffMs: 0,
		});
		const expectation = expect(promise).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(1000);
		await expectation;
	});
});
