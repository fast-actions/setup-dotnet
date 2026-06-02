import * as core from '@actions/core';

interface FetchWithRetryOptions {
	retries?: number;
	timeoutMs?: number;
	backoffMs?: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_BACKOFF_MS = 1000;

function isRetriableStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Retries transient network failures, timeouts and 5xx/429 responses.
// Returns the final Response so callers keep their own response.ok handling.
export async function fetchWithRetry(
	url: string,
	options: FetchWithRetryOptions = {},
): Promise<Response> {
	const retries = options.retries ?? DEFAULT_RETRIES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;

	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, { signal: controller.signal });

			if (isRetriableStatus(response.status) && attempt < retries) {
				core.warning(
					`Request to ${url} returned status ${response.status}, retrying...`,
				);
				await delay(backoffMs * attempt);
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				core.warning(
					`Request to ${url} failed (${lastError.message}), retrying...`,
				);
				await delay(backoffMs * attempt);
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	throw (
		lastError ?? new Error(`Request to ${url} failed after ${retries} attempts`)
	);
}
