import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { TokenResolver } from "../../src/services/token-resolver";
import { IntentParser } from "../../src/parser";
import type { ResolvedToken } from "../../src/types/token";

describe("TokenResolver Service", () => {
    let resolver: TokenResolver;

    // Mock fetch
    const mockFetch = mock((url: string) => {
        if (url.includes("USDC") && url.includes("polygon")) {
            return Promise.resolve(new Response(JSON.stringify([{
                symbol: "USDC",
                address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                decimals: 6,
                chain: "polygon",
                name: "USD Coin (PoS)",
                price: 1.0,
                logo: "https://example.com/usdc.png"
            }])));
        }
        if (url.includes("ETH") && url.includes("ethereum")) {
            return Promise.resolve(new Response(JSON.stringify([{
                symbol: "ETH",
                address: "0x0000000000000000000000000000000000000000",
                decimals: 18,
                chain: "ethereum",
                name: "Ethereum",
                price: 3000.0,
                logo: "https://example.com/eth.png"
            }])));
        }
        return Promise.resolve(new Response(JSON.stringify([])));
    });

    beforeEach(() => {
        global.fetch = mockFetch as any;
        resolver = new TokenResolver({ enabled: true, cacheTTL: 1000 }); // Short TTL for testing
        mockFetch.mockClear();
    });

    afterEach(() => {
        mockFetch.mockClear();
    });

    test("should resolve token explicitly via API", async () => {
        const token = await resolver.resolve("USDC", "polygon");
        expect(token).not.toBeNull();
        expect(token?.symbol).toBe("USDC");
        expect(token?.address).toBe("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
        expect(token?.chain).toBe("polygon");
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should return null for unknown token", async () => {
        const token = await resolver.resolve("UNKNOWN", "polygon");
        expect(token).toBeNull();
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should cache resolved tokens", async () => {
        // First call - should hit API
        const token1 = await resolver.resolve("USDC", "polygon");
        expect(token1).not.toBeNull();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Second call - should hit cache (no new API call)
        const token2 = await resolver.resolve("USDC", "polygon");
        expect(token2).not.toBeNull();
        expect(token2).toEqual(token1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should respect cache TTL", async () => {
        // First call
        await resolver.resolve("USDC", "polygon");
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Wait for TTL (1000ms + buffer)
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Second call - should hit API again
        await resolver.resolve("USDC", "polygon");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("should use custom resolver if provided", async () => {
        const customResolver = new TokenResolver({
            enabled: true,
            customResolver: async (s, c) => ({
                symbol: s,
                address: "0xCUSTOM",
                decimals: 18,
                chain: c
            })
        });

        const token = await customResolver.resolve("TEST", "chain");
        expect(token?.address).toBe("0xCUSTOM");
        expect(mockFetch).toHaveBeenCalledTimes(0);
    });

    test("should support batch resolution", async () => {
        const tokens = [
            { symbol: "USDC", chain: "polygon" },
            { symbol: "ETH", chain: "ethereum" }
        ];

        const results = await resolver.resolveMany(tokens);

        expect(results.size).toBe(2);
        expect(results.get("USDC:polygon")?.address).toBe("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
        expect(results.get("ETH:ethereum")?.symbol).toBe("ETH");
    });
});

describe("IntentParser Integration", () => {
    // Mock fetch for integration tests
    const mockFetch = mock((url: string) => {
        if (url.includes("USDC") && url.includes("polygon")) {
            return Promise.resolve(new Response(JSON.stringify([{
                symbol: "USDC",
                address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                decimals: 6,
                chain: "polygon"
            }])));
        }
        return Promise.resolve(new Response(JSON.stringify([])));
    });

    beforeEach(() => {
        global.fetch = mockFetch as any;
    });

    test("parseAsync should populate token addresses", async () => {
        const parser = new IntentParser({
            tokenResolver: { enabled: true, cacheTTL: 60000, timeout: 5000 }
        });

        const result = await parser.parseAsync("Swap 100 USDC on Polygon");

        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("swap");
        expect(result.data?.parameters.inputToken).toBe("USDC");
        expect(result.data?.parameters.sourceChain).toBe("Polygon");

        // This is the key assertion for Phase 3
        expect(result.data?.parameters.inputTokenAddress).toBe("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
    });

    test("parse (sync) should NOT populate addresses even if configured", () => {
        const parser = new IntentParser({
            tokenResolver: { enabled: true, cacheTTL: 60000, timeout: 5000 }
        });

        const result = parser.parse("Swap 100 USDC on Polygon");

        expect(result.success).toBe(true);
        expect(result.data?.parameters.inputToken).toBe("USDC");
        // Should remain undefined because sync parse doesn't await resolver
        expect(result.data?.parameters.inputTokenAddress).toBeUndefined();
    });

    test("parseAsync should handle resolution failures gracefully", async () => {
        const parser = new IntentParser({
            tokenResolver: { enabled: true, cacheTTL: 60000, timeout: 5000 }
        });

        // "UNKNOWN" token defaults to mocked empty response
        const result = await parser.parseAsync("Swap 100 UNKNOWN on Polygon");

        expect(result.success).toBe(true);
        expect(result.data?.parameters.inputToken).toBe("UNKNOWN");
        expect(result.data?.parameters.inputTokenAddress).toBeUndefined();

        // Should verify warnings presence
        expect(result.data?.metadata.warnings).toContain("Could not resolve address for UNKNOWN on polygon");
    });
});
