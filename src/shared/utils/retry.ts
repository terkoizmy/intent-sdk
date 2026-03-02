/**
 * Retry Utility with Exponential Backoff
 *
 * Generic retry wrapper for async operations with configurable
 * backoff, jitter, and retryable-error filtering.
 *
 * Stage 3 — Phase G (Production Hardening)
 *
 * USAGE:
 *   const result = await withRetry(() => provider.getBlockNumber(), {
 *       maxRetries: 3,
 *       baseDelayMs: 1000,
 *       onRetry: (err, attempt) => console.warn(`Retry ${attempt}: ${err.message}`),
 *   });
 */

export interface RetryOptions {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;

    /** Base delay in ms before first retry (default: 1000) */
    baseDelayMs?: number;

    /** Maximum delay cap in ms (default: 10000) */
    maxDelayMs?: number;

    /**
     * Predicate to decide if an error is retryable.
     * Return `true` to retry, `false` to throw immediately.
     * Default: retries all errors.
     */
    isRetryable?: (error: Error) => boolean;

    /**
     * Callback invoked before each retry attempt.
     * Useful for logging.
     */
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "isRetryable" | "onRetry">> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10_000,
};

/**
 * Execute an async function with exponential backoff retry.
 *
 * Delay formula: `min(baseDelay * 2^attempt + jitter, maxDelay)`
 *
 * @param fn       - Async function to execute
 * @param options  - Retry configuration
 * @returns The result of `fn()` on success
 * @throws The last error after all retries are exhausted, or immediately for non-retryable errors
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const maxRetries = options.maxRetries ?? DEFAULT_OPTIONS.maxRetries;
    const baseDelayMs = options.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
    const maxDelayMs = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            lastError = error;

            // Check if we've exhausted retries
            if (attempt >= maxRetries) {
                break;
            }

            // Check if error is retryable
            if (options.isRetryable && !options.isRetryable(error)) {
                break;
            }

            // Calculate delay with exponential backoff + jitter
            const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
            const jitter = Math.random() * baseDelayMs * 0.5;
            const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

            // Notify before sleeping
            if (options.onRetry) {
                options.onRetry(error, attempt + 1, delay);
            }

            await sleep(delay);
        }
    }

    throw lastError!;
}

/**
 * Check if an RPC/network error is transient and worth retrying.
 *
 * Retryable conditions:
 * - Timeout errors
 * - HTTP 429 (Too Many Requests)
 * - HTTP 502/503/504 (Bad Gateway / Service Unavailable / Gateway Timeout)
 * - Connection refused / reset
 * - "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"
 */
export function isTransientNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Common transient patterns
    const transientPatterns = [
        "timeout",
        "econnreset",
        "econnrefused",
        "etimedout",
        "enotfound",
        "socket hang up",
        "network error",
        "fetch failed",
        "429",
        "too many requests",
        "502",
        "503",
        "504",
        "bad gateway",
        "service unavailable",
        "gateway timeout",
        "rate limit",
    ];

    return transientPatterns.some(pattern => message.includes(pattern));
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
