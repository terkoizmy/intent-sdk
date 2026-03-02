/**
 * Phase D: Live Swing API Integration Tests
 *
 * These tests call the REAL Swing.xyz API over the network.
 * They do NOT spend gas or move any funds — they only query quotes and statuses.
 *
 * Required Env Vars:
 * - SWING_API_KEY  → Your Swing platform API key (https://platform.swing.xyz/)
 *
 * How to run:
 *   SWING_API_KEY=your_key bun test tests/live/swing-api.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { SwingProtocol, FetchHttpClient, SwingAuthError, SwingRateLimitError, type IHttpClient } from "@/solver/protocols/aggregators/swing";

// ---------------------------------------------------------------------------
// Guard: skip all tests if no API key is provided
// ---------------------------------------------------------------------------

const SWING_API_KEY = process.env.SWING_API_KEY;
const HAS_API_KEY = !!SWING_API_KEY;

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

/*
describe("Phase D: Live Swing API Integration", () => {
    let swing: SwingProtocol;

    beforeAll(() => {
        if (!HAS_API_KEY) return;

        swing = new SwingProtocol(SWING_API_KEY!);
    });

    // -------------------------------------------------------------------------
    // Test 1: quote() — Ethereum → Arbitrum USDC
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_API_KEY)("should return a valid quote for ETH → Arbitrum USDC bridge", async () => {
        const quote = await swing.quote({
            fromChain: 1, // Ethereum mainnet
            toChain: 42161, // Arbitrum One
            token: "USDC", // Usually Swing accepts symbol like "USDC"
            amount: 10_000_000n, // 10 USDC (6 decimals)
        });

        expect(quote).toBeDefined();
        expect(quote.outputAmount).toBeGreaterThan(0n);
        expect(quote.fee).toBeGreaterThanOrEqual(0n);
        expect(quote.estimatedTimeMs).toBeGreaterThan(0);
        expect(quote.protocolName).toBe("swing");

        console.log("[Swing] Quote:", {
            inputAmount: quote.inputAmount.toString(),
            outputAmount: quote.outputAmount.toString(),
            fee: quote.fee.toString(),
            estimatedTimeMs: quote.estimatedTimeMs,
        });
    }, 15000);

    // -------------------------------------------------------------------------
    // Test 2: getTokens() — Token discovery for Ethereum mainnet
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_API_KEY)("should return a non-empty token list for Ethereum mainnet (chainId 1)", async () => {
        const tokens = await swing.getTokens(1);

        expect(Array.isArray(tokens)).toBe(true);
        expect(tokens.length).toBeGreaterThan(0);

        const first = tokens[0];
        expect(first.symbol).toBeDefined();
        expect(first.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(first.decimals).toBeGreaterThan(0);

        const usdc = tokens.find(t => t.symbol === "USDC");
        expect(usdc).toBeDefined();

        console.log("[Swing] First 3 tokens on Ethereum:", tokens.slice(0, 3));
    }, 15000);

    // -------------------------------------------------------------------------
    // Test 3: getTransferStatus() — Known transfer ID
    // -------------------------------------------------------------------------

    test.skip("should return a valid status for a known Swing transfer ID", async () => {
        // Skipping this normally as we don't have a reliable transfer ID to poll.
        // Insert one manually to locally test.
        const KNOWN_TRANSFER_ID = "123456789";
        const status = await swing.getTransferStatus(KNOWN_TRANSFER_ID);
        expect(["pending", "done", "failed"]).toContain(status);
        console.log("[Swing] Transfer status:", status);
    });

    // -------------------------------------------------------------------------
    // Test 4: Error handling — Invalid API key (401)
    // -------------------------------------------------------------------------

    test("should throw a descriptive error when API key is invalid (401)", async () => {
        const badSwing = new SwingProtocol("invalid-key-12345");

        // The token endpoint might be public, so we use quote() to reliably trigger a 401
        await expect(
            badSwing.quote({ fromChain: 1, toChain: 42161, token: "USDC", amount: 10_000_000n })
        ).rejects.toThrow(SwingAuthError);
    });

    // -------------------------------------------------------------------------
    // Test 5: Error handling — Rate limit simulation (429)
    // -------------------------------------------------------------------------

    test("should retry and/or throw a descriptive error on rate limit (429)", async () => {
        let callCount = 0;
        const mockClient: IHttpClient = {
            async get() {
                callCount++;
                if (callCount === 1) {
                    // Simulate 429
                    const fakeRes = new Response("", { status: 429, headers: { "Retry-After": "1" } });
                    if (!fakeRes.ok) {
                        // Using the same logic as our FetchHttpClient expects to wrap fetch
                        // but actually our mock needs to throw the corresponding error if we mimic fetch.
                        // Wait, FetchHttpClient encapsulates the retry. If we want to test FetchHttpClient,
                        // we should mock global.fetch. Let's do that cleanly.
                    }
                }
                return { routes: [{ quote: { integration: { amountOut: "100" } } }] };
            },
            async post() { return {}; }
        };

        // Better way to test the logic is to test the FetchHttpClient directly, mocking fetch.
        const originalFetch = global.fetch;
        let fetchCalls = 0;

        global.fetch = (async (...args: any[]) => {
            fetchCalls++;
            if (fetchCalls === 1) {
                return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }) as any;

        const client = new FetchHttpClient(1); // 1 max retry

        try {
            const result = await client.get("http://dummy.com/test");
            expect(result.success).toBe(true);
            expect(fetchCalls).toBe(2);
        } finally {
            global.fetch = originalFetch; // restore
        }
    });

    // -------------------------------------------------------------------------
    // Test 6: Rate limit simulation exhaust retries (429)
    // -------------------------------------------------------------------------
    test("should throw SwingRateLimitError when 429 exhausts retries", async () => {
        const originalFetch = global.fetch;
        global.fetch = (async (...args: any[]) => {
            return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
        }) as any;

        const client = new FetchHttpClient(1); // 1 max retry
        await expect(client.get("http://dummy.com/test")).rejects.toThrow(SwingRateLimitError);
        global.fetch = originalFetch; // restore
    }, 10000);
});

