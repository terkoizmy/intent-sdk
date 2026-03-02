/**
 * Token Enrichment Unit Tests
 *
 * Tests for:
 * - enrichIntent() — resolves token symbols to addresses
 * - resolveFromSymbol() — standalone token resolution
 * - TESTNET_TOKENS / MAINNET_TOKENS registration
 *
 * Stage 3 — Live Integration
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { TokenRegistry, DEFAULT_TOKENS, TESTNET_TOKENS, MAINNET_TOKENS, resolveFromSymbol, type TokenInfo } from "@/shared/token-registry/registry";
import { enrichIntent, type EnrichedIntent } from "@/shared/token-registry/enrichment";
import type { StructuredIntent } from "@/types/intent";

describe("Stage 3 Phase A: Token Enrichment", () => {
    let registry: TokenRegistry;

    beforeEach(() => {
        registry = new TokenRegistry();
    });

    // ─────────────────────────────────────────────────────
    // TESTNET_TOKENS registration
    // ─────────────────────────────────────────────────────
    describe("TESTNET_TOKENS", () => {
        test("should register all testnet tokens without error", () => {
            registry.registerAll(TESTNET_TOKENS);
            expect(registry.listAll().some((t: TokenInfo) => t.name.includes("Testnet"))).toBe(true);
        });

        test("should contain USDC on Sepolia (chainId: 11155111)", () => {
            registry.registerAll(TESTNET_TOKENS);
            const token = registry.get("USDC", 11155111);
            expect(token).toBeDefined();
            expect(token?.address).toBe("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
        });

        test("should contain USDC on Arbitrum Sepolia (chainId: 421614)", () => {
            registry.registerAll(TESTNET_TOKENS);
            const token = registry.get("USDC", 421614);
            expect(token).toBeDefined();
        });

        test("should contain USDC on Unichain Sepolia (chainId: 1301)", () => {
            registry.registerAll(TESTNET_TOKENS);
            const token = registry.get("USDC", 1301);
            expect(token).toBeDefined();
        });

        test("should contain USDC on Base Sepolia (chainId: 84532)", () => {
            registry.registerAll(TESTNET_TOKENS);
            const token = registry.get("USDC", 84532);
            expect(token).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────
    // MAINNET_TOKENS registration
    // ─────────────────────────────────────────────────────
    describe("MAINNET_TOKENS", () => {
        test("should register all mainnet tokens without error", () => {
            registry.registerAll(MAINNET_TOKENS);
            expect(registry.listAll().length).toBeGreaterThan(0);
        });

        test("should contain USDT on Ethereum (chainId: 1)", () => {
            registry.registerAll(MAINNET_TOKENS);
            expect(registry.get("USDT", 1)).toBeDefined();
        });

        test("should contain WETH on Arbitrum (chainId: 42161)", () => {
            registry.registerAll(MAINNET_TOKENS);
            expect(registry.get("WETH", 42161)).toBeDefined();
        });

        test("should contain DAI on Ethereum (chainId: 1)", () => {
            registry.registerAll(MAINNET_TOKENS);
            expect(registry.get("DAI", 1)).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────
    // resolveFromSymbol()
    // ─────────────────────────────────────────────────────
    describe("resolveFromSymbol()", () => {
        beforeEach(() => {
            registry.registerAll(DEFAULT_TOKENS);
        });

        test("should resolve USDC on Ethereum to correct address", () => {
            const address = resolveFromSymbol(registry, "USDC", 1);
            expect(address.toLowerCase()).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase());
        });

        test("should throw for unregistered token", () => {
            expect(() => resolveFromSymbol(registry, "UNKNOWN", 1)).toThrow();
        });

        test("should throw for valid token on unregistered chain", () => {
            expect(() => resolveFromSymbol(registry, "USDC", 999)).toThrow();
        });

        test("should be case-insensitive for symbol lookup", () => {
            const address = resolveFromSymbol(registry, "usdc", 1);
            expect(address.toLowerCase()).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase());
        });
    });

    // ─────────────────────────────────────────────────────
    // enrichIntent()
    // ─────────────────────────────────────────────────────
    describe("enrichIntent()", () => {
        beforeEach(() => {
            registry.registerAll(DEFAULT_TOKENS);
        });

        const mockBridgeIntent: StructuredIntent = {
            intentType: "bridge",
            parameters: {
                inputToken: "USDC",
                outputToken: "USDC",
                inputAmount: "100000000",
                sourceChain: "ethereum",
                targetChain: "arbitrum",
            },
            constraints: {
                deadline: Math.floor(Date.now() / 1000) + 3600,
                maxSlippage: 50,
            },
            metadata: {
                originalText: "Bridge 100 USDC to Arbitrum",
                confidence: 0.95,
                parsedAt: Date.now(),
            },
        };

        test("should enrich bridge intent with input and output token addresses", () => {
            const result = enrichIntent({ ...mockBridgeIntent }, registry, 1, 42161);
            expect(result.enriched).toBe(true);
            expect(result.parameters.inputTokenAddress?.toLowerCase()).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase());
            expect(result.parameters.outputTokenAddress?.toLowerCase()).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase());
        });

        test("should add warning when input token cannot be resolved", () => {
            const intent = {
                ...mockBridgeIntent,
                parameters: { ...mockBridgeIntent.parameters, inputToken: "UNKNOWN" }
            };
            const result = enrichIntent(intent, registry, 1, 42161);
            expect(result.enrichmentWarnings.length).toBeGreaterThan(0);
            expect(result.enrichmentWarnings[0]).toContain("UNKNOWN");
        });

        test("should work with same source and target chain (send intent)", () => {
            const intent = {
                ...mockBridgeIntent,
                intentType: "send" as const,
                parameters: { inputToken: "USDC", recipient: "0x123" }
            };
            const result = enrichIntent(intent, registry, 1);
            expect(result.enriched).toBe(true);
            expect(result.parameters.inputTokenAddress?.toLowerCase()).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase());
        });

        test("should preserve all original intent fields", () => {
            const result = enrichIntent({ ...mockBridgeIntent }, registry, 1, 42161);
            expect(result.intentType).toBe(mockBridgeIntent.intentType);
            expect(result.metadata.confidence).toBe(mockBridgeIntent.metadata.confidence);
            expect(result.constraints.deadline).toBe(mockBridgeIntent.constraints.deadline);
        });

        test("should work with testnet tokens on Sepolia", () => {
            registry.registerAll(TESTNET_TOKENS);
            const intent = {
                ...mockBridgeIntent,
                intentType: "send" as const,
                parameters: { inputToken: "USDC", recipient: "0x123" }
            };
            const result = enrichIntent(intent, registry, 11155111);
            expect(result.enriched).toBe(true);
            expect(result.parameters.inputTokenAddress?.toLowerCase()).toBe("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238".toLowerCase());
        });
    });
});
