import * as core from '@actions/core';

interface FetchWithRetryOptions {
	retries?: number;
	timeoutMilliseconds?: number;
	backoffMilliseconds?: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MILLISECONDS = 30000;
const DEFAULT_BACKOFF_MILLISECONDS = 1000;

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
	const timeoutMilliseconds =
		options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
	const backoffMilliseconds =
		options.backoffMilliseconds ?? DEFAULT_BACKOFF_MILLISECONDS;

	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

		try {
			const response = await fetch(url, { signal: controller.signal });

			if (isRetriableStatus(response.status) && attempt < retries) {
				core.warning(
					`Request to ${url} returned status ${response.status}, retrying...`,
				);
				await delay(backoffMilliseconds * attempt);
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < retries) {
				core.warning(
					`Request to ${url} failed (${lastError.message}), retrying...`,
				);
				await delay(backoffMilliseconds * attempt);
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	throw (
		lastError ?? new Error(`Request to ${url} failed after ${retries} attempts`)
	);
}
