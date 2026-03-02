/**
 * Tests for retry utility with exponential backoff.
 *
 * Stage 3 — Phase G
 */

import { describe, test, expect } from "bun:test";
import { withRetry, isTransientNetworkError } from "../../src/shared/utils/retry";

describe("withRetry", () => {
    test("T1: succeeds on first attempt — returns result immediately", async () => {
        let callCount = 0;
        const result = await withRetry(async () => {
            callCount++;
            return "ok";
        });
        expect(result).toBe("ok");
        expect(callCount).toBe(1);
    });

    test("T2: fails twice then succeeds — returns result after retries", async () => {
        let callCount = 0;
        const result = await withRetry(
            async () => {
                callCount++;
                if (callCount < 3) throw new Error("transient");
                return "recovered";
            },
            { maxRetries: 3, baseDelayMs: 10 },
        );
        expect(result).toBe("recovered");
        expect(callCount).toBe(3);
    });

    test("T3: fails past maxRetries — throws last error", async () => {
        let callCount = 0;
        await expect(
            withRetry(
                async () => {
                    callCount++;
                    throw new Error(`fail-${callCount}`);
                },
                { maxRetries: 2, baseDelayMs: 10 },
            ),
        ).rejects.toThrow("fail-3"); // initial + 2 retries = 3 calls
        expect(callCount).toBe(3);
    });

    test("T4: non-retryable error — throws immediately without retry", async () => {
        let callCount = 0;
        await expect(
            withRetry(
                async () => {
                    callCount++;
                    throw new Error("fatal: contract reverted");
                },
                {
                    maxRetries: 3,
                    baseDelayMs: 10,
                    isRetryable: (err: Error) => !err.message.includes("fatal"),
                },
            ),
        ).rejects.toThrow("contract reverted");
        expect(callCount).toBe(1); // Should not retry
    });

    test("T5: onRetry callback is invoked with correct attempt number", async () => {
        const retryLog: { attempt: number; delay: number }[] = [];
        let callCount = 0;

        await withRetry(
            async () => {
                callCount++;
                if (callCount < 3) throw new Error("retry me");
                return "done";
            },
            {
                maxRetries: 3,
                baseDelayMs: 10,
                onRetry: (_err: Error, attempt: number, delay: number) => {
                    retryLog.push({ attempt, delay });
                },
            },
        );

        expect(retryLog.length).toBe(2);
        expect(retryLog[0].attempt).toBe(1);
        expect(retryLog[1].attempt).toBe(2);
        // Delay should increase (exponential backoff)
        expect(retryLog[1].delay).toBeGreaterThanOrEqual(retryLog[0].delay);
    });

    test("T6: maxRetries = 0 means no retries", async () => {
        let callCount = 0;
        await expect(
            withRetry(
                async () => {
                    callCount++;
                    throw new Error("no retry");
                },
                { maxRetries: 0 },
            ),
        ).rejects.toThrow("no retry");
        expect(callCount).toBe(1);
    });
});

describe("isTransientNetworkError", () => {
    test("recognizes timeout errors", () => {
        expect(isTransientNetworkError(new Error("Request timeout"))).toBe(true);
        expect(isTransientNetworkError(new Error("ETIMEDOUT"))).toBe(true);
    });

    test("recognizes HTTP 429 rate limit", () => {
        expect(isTransientNetworkError(new Error("429 Too Many Requests"))).toBe(true);
        expect(isTransientNetworkError(new Error("rate limit exceeded"))).toBe(true);
    });

    test("recognizes HTTP 502/503/504", () => {
        expect(isTransientNetworkError(new Error("502 Bad Gateway"))).toBe(true);
        expect(isTransientNetworkError(new Error("503 Service Unavailable"))).toBe(true);
        expect(isTransientNetworkError(new Error("504 Gateway Timeout"))).toBe(true);
    });

    test("recognizes connection errors", () => {
        expect(isTransientNetworkError(new Error("ECONNRESET"))).toBe(true);
        expect(isTransientNetworkError(new Error("ECONNREFUSED"))).toBe(true);
        expect(isTransientNetworkError(new Error("fetch failed"))).toBe(true);
    });

    test("does NOT match contract revert errors", () => {
        expect(isTransientNetworkError(new Error("execution reverted"))).toBe(false);
        expect(isTransientNetworkError(new Error("insufficient funds"))).toBe(false);
        expect(isTransientNetworkError(new Error("nonce too low"))).toBe(false);
    });
});
