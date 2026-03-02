import { describe, expect, test } from "bun:test";
import {
    mergeEntities,
    calculateConfidence,
} from "../../src/parser/utils/parser-helpers";
import { normalizeText, normalizeTokenSymbol, parseAmountWithDecimals } from "../../src/parser/utils/normalize";

// ═══════════════════════════════════════════════════
// normalizeText
// ═══════════════════════════════════════════════════
describe("normalizeText", () => {
    test("should trim whitespace", () => {
        expect(normalizeText("  hello  ")).toBe("hello");
    });

    test("should collapse multiple spaces", () => {
        expect(normalizeText("swap   100    USDC")).toBe("swap 100 USDC");
    });

    test("should normalize curly/smart quotes to straight quotes", () => {
        const result = normalizeText("\u201CHello\u201D");
        expect(result).toBe('"Hello"');
    });

    test("should normalize smart apostrophes", () => {
        const result = normalizeText("don\u2019t");
        expect(result).toBe("don't");
    });

    test("should handle empty string", () => {
        expect(normalizeText("")).toBe("");
    });

    test("should preserve case (not lowercase)", () => {
        // normalizeText does NOT lowercase — classifier handles case-insensitive matching
        expect(normalizeText("Swap USDC")).toBe("Swap USDC");
    });
});

// ═══════════════════════════════════════════════════
// normalizeTokenSymbol
// ═══════════════════════════════════════════════════
describe("normalizeTokenSymbol", () => {
    test("should uppercase token", () => {
        expect(normalizeTokenSymbol("usdc")).toBe("USDC");
    });

    test("should trim whitespace", () => {
        expect(normalizeTokenSymbol("  eth  ")).toBe("ETH");
    });

    test("should handle already uppercase", () => {
        expect(normalizeTokenSymbol("WBTC")).toBe("WBTC");
    });
});

// ═══════════════════════════════════════════════════
// parseAmountWithDecimals
// ═══════════════════════════════════════════════════
describe("parseAmountWithDecimals", () => {
    test("should convert USDC (6 decimals)", () => {
        expect(parseAmountWithDecimals(1000, "USDC")).toBe("1000000000");
    });

    test("should convert ETH (18 decimals)", () => {
        expect(parseAmountWithDecimals(1, "ETH")).toBe("1000000000000000000");
    });

    test("should convert WBTC (8 decimals)", () => {
        expect(parseAmountWithDecimals(1, "WBTC")).toBe("100000000");
    });

    test("should default to 18 decimals for unknown token", () => {
        expect(parseAmountWithDecimals(1, "UNKNOWN")).toBe("1000000000000000000");
    });
});

// ═══════════════════════════════════════════════════
// calculateConfidence
// ═══════════════════════════════════════════════════
describe("calculateConfidence", () => {
    const swapTemplate = {
        type: "swap",
        name: "swap",
        requiredFields: ["inputToken", "outputToken", "inputAmount"],
        optionalFields: ["minOutputAmount", "recipient", "maxSlippage"],
        defaults: {},
        defaultConstraints: {},
        validate: () => true,
    };

    const unknownTemplate = {
        type: "unknown",
        name: "unknown",
        requiredFields: [],
        optionalFields: [],
        defaults: {},
        defaultConstraints: {},
        validate: () => true,
    };

    test("should return 0 for null template", () => {
        expect(calculateConfidence({}, null)).toBe(0);
    });

    test("should return 0.1 for unknown template", () => {
        expect(calculateConfidence({}, unknownTemplate)).toBe(0.1);
    });

    test("should return higher score when all required fields are present", () => {
        const params = { inputToken: "USDC", outputToken: "ETH", inputAmount: "1000" };
        const score = calculateConfidence(params, swapTemplate);
        // 0.4 + (3/3 * 0.4) = 0.8
        expect(score).toBeGreaterThanOrEqual(0.8);
    });

    test("should return lower score when required fields are missing", () => {
        const params = { inputToken: "USDC" }; // 1 of 3 required
        const score = calculateConfidence(params, swapTemplate);
        // 0.4 + (1/3 * 0.4) ≈ 0.533
        expect(score).toBeLessThan(0.7);
    });

    test("should give bonus for optional fields", () => {
        const paramsBase = { inputToken: "USDC", outputToken: "ETH", inputAmount: "1000" };
        const paramsWithOptional = { ...paramsBase, maxSlippage: 100 };

        const scoreBase = calculateConfidence(paramsBase, swapTemplate);
        const scoreWithOptional = calculateConfidence(paramsWithOptional, swapTemplate);
        expect(scoreWithOptional).toBeGreaterThan(scoreBase);
    });

    test("should give bonus for resolved token addresses", () => {
        const paramsBase = { inputToken: "USDC", outputToken: "ETH", inputAmount: "1000" };
        const paramsWithAddress = {
            ...paramsBase,
            inputTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        };

        const scoreBase = calculateConfidence(paramsBase, swapTemplate);
        const scoreWithAddress = calculateConfidence(paramsWithAddress, swapTemplate);
        expect(scoreWithAddress).toBeGreaterThan(scoreBase);
    });

    test("should give bonus for sourceChain", () => {
        const paramsBase = { inputToken: "USDC", outputToken: "ETH", inputAmount: "1000" };
        const paramsWithChain = { ...paramsBase, sourceChain: "Polygon" };

        const scoreBase = calculateConfidence(paramsBase, swapTemplate);
        const scoreWithChain = calculateConfidence(paramsWithChain, swapTemplate);
        expect(scoreWithChain).toBeGreaterThan(scoreBase);
    });

    test("should cap confidence at 1.0", () => {
        const params = {
            inputToken: "USDC",
            outputToken: "ETH",
            inputAmount: "1000",
            inputTokenAddress: "0x...",
            outputTokenAddress: "0x...",
            sourceChain: "Polygon",
            riskLevel: "low",
            maxSlippage: 100,
            minOutputAmount: "0.5",
            recipient: "0x...",
        };
        const score = calculateConfidence(params, swapTemplate);
        expect(score).toBeLessThanOrEqual(1.0);
    });
});

// ═══════════════════════════════════════════════════
// mergeEntities — Swap
// ═══════════════════════════════════════════════════
describe("mergeEntities", () => {
    describe("swap intent", () => {
        test("should map first amount to inputAmount", () => {
            const entities = {
                amounts: [{ value: 1000, rawText: "1000", position: [5, 9] }],
                tokens: [
                    { symbol: "USDC", type: "fungible", rawText: "USDC", address: "0x...", position: [10, 14] },
                    { symbol: "ETH", type: "fungible", rawText: "ETH", position: [18, 21] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "swap", "Swap 1000 USDC to ETH");
            expect(params.inputAmount).toBe("1000");
            expect(params.inputToken).toBe("USDC");
            expect(params.outputToken).toBe("ETH");
        });

        test("should set inputTokenAddress from known token", () => {
            const entities = {
                amounts: [{ value: 100, rawText: "100", position: [5, 8] }],
                tokens: [
                    { symbol: "USDC", type: "fungible", rawText: "USDC", address: "0xA0b8", position: [9, 13] },
                    { symbol: "ETH", type: "fungible", rawText: "ETH", position: [17, 20] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "swap", "Swap 100 USDC to ETH");
            expect(params.inputTokenAddress).toBe("0xA0b8");
        });

        test("should detect chain override from 'on Polygon'", () => {
            const entities = {
                amounts: [{ value: 100, rawText: "100", position: [5, 8] }],
                tokens: [
                    { symbol: "USDC", type: "fungible", rawText: "USDC", position: [9, 13] },
                    { symbol: "ETH", type: "fungible", rawText: "ETH", position: [17, 20] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "swap", "Swap 100 USDC to ETH on Polygon");
            expect(params.sourceChain).toBe("Polygon");
        });
    });

    // ─────────────────────────────────────────────────
    // Yield Strategy
    // ─────────────────────────────────────────────────
    describe("yield_strategy intent", () => {
        test("should map amount and token", () => {
            const entities = {
                amounts: [{ value: 10000, rawText: "10k", position: [15, 18] }],
                tokens: [{ symbol: "USDC", type: "fungible", rawText: "USDC", position: [19, 23] }],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "yield_strategy", "Maximize yield 10k USDC");
            expect(params.inputAmount).toBe("10000");
            expect(params.inputToken).toBe("USDC");
        });

        test("should detect low risk from 'safe' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "find safe yield");
            expect(params.riskLevel).toBe("low");
        });

        test("should detect low risk from 'conservative' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "conservative strategy");
            expect(params.riskLevel).toBe("low");
        });

        test("should detect high risk from 'degen' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "degen yield farming");
            expect(params.riskLevel).toBe("high");
        });

        test("should detect high risk from 'aggressive' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "aggressive high yield");
            expect(params.riskLevel).toBe("high");
        });

        test("should detect diversification from 'diversify' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "diversify across protocols");
            expect(params.diversificationRequired).toBe(true);
        });

        test("should detect diversification from 'split' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "yield_strategy", "split across multiple protocols");
            expect(params.diversificationRequired).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────
    // NFT Purchase
    // ─────────────────────────────────────────────────
    describe("nft_purchase intent", () => {
        test("should map first amount to maxPrice", () => {
            const entities = {
                amounts: [{ value: 10, rawText: "10", position: [20, 22] }],
                tokens: [
                    { symbol: "Bored Ape Yacht Club", type: "collection", rawText: "BAYC", position: [4, 8] },
                    { symbol: "ETH", type: "fungible", rawText: "ETH", address: "0x...", position: [23, 26] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "nft_purchase", "Buy BAYC for 10 ETH");
            expect(params.maxPrice).toBe("10");
        });

        test("should map collection from type=collection tokens", () => {
            const entities = {
                amounts: [],
                tokens: [
                    { symbol: "Bored Ape Yacht Club", type: "collection", rawText: "BAYC", position: [4, 8] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "nft_purchase", "Buy BAYC");
            expect(params.collection).toBe("Bored Ape Yacht Club");
        });

        test("should map payment token from fungible tokens", () => {
            const entities = {
                amounts: [{ value: 10, rawText: "10", position: [13, 15] }],
                tokens: [
                    { symbol: "Azuki", type: "collection", rawText: "Azuki", position: [4, 9] },
                    { symbol: "ETH", type: "fungible", rawText: "ETH", address: "0x...", position: [16, 19] },
                ],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "nft_purchase", "Buy Azuki for 10 ETH");
            expect(params.inputToken).toBe("ETH");
            expect(params.inputTokenAddress).toBe("0x...");
        });
    });

    // ─────────────────────────────────────────────────
    // Send
    // ─────────────────────────────────────────────────
    describe("send intent", () => {
        test("should map token and amount", () => {
            const entities = {
                amounts: [{ value: 0.5, rawText: "0.5", position: [5, 8] }],
                tokens: [{ symbol: "ETH", type: "fungible", rawText: "ETH", position: [9, 12] }],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "send", "Send 0.5 ETH to 0x1234567890abcdef1234567890abcdef12345678");
            expect(params.inputToken).toBe("ETH");
            expect(params.inputAmount).toBe("0.5");
        });

        test("should extract 0x recipient address", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const text = "Send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678";
            const params = mergeEntities(entities, "send", text);
            expect(params.recipient).toBe("0x1234567890abcdef1234567890abcdef12345678");
        });

        test("should extract ENS recipient (.eth)", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const text = "Send 100 USDC to vitalik.eth";
            const params = mergeEntities(entities, "send", text);
            expect(params.recipient).toBe("vitalik.eth");
        });

        test("should detect chain override for send", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const text = "send 100 USDC to vitalik.eth on polygon";
            const params = mergeEntities(entities, "send", text);
            expect(params.sourceChain).toBe("Polygon");
        });
    });

    // ─────────────────────────────────────────────────
    // Bridge
    // ─────────────────────────────────────────────────
    describe("bridge intent", () => {
        test("should map token, amount, and chains", () => {
            const entities = {
                amounts: [{ value: 100, rawText: "100", position: [7, 10] }],
                tokens: [{ symbol: "USDC", type: "fungible", rawText: "USDC", position: [11, 15] }],
                actions: [],
                constraints: [],
            };
            const text = "Bridge 100 USDC from ethereum to polygon";
            const params = mergeEntities(entities, "bridge", text);
            expect(params.inputToken).toBe("USDC");
            expect(params.inputAmount).toBe("100");
            expect(params.sourceChain).toBe("Ethereum");
            expect(params.targetChain).toBe("Polygon");
        });

        test("should detect Arbitrum as target chain", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const text = "bridge ETH from mainnet to arbitrum";
            const params = mergeEntities(entities, "bridge", text);
            expect(params.sourceChain).toBe("Ethereum");
            expect(params.targetChain).toBe("Arbitrum");
        });

        test("should detect BSC aliases", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const text = "bridge USDC from polygon to bsc";
            const params = mergeEntities(entities, "bridge", text);
            expect(params.targetChain).toBe("BSC");
        });
    });

    // ─────────────────────────────────────────────────
    // Claim
    // ─────────────────────────────────────────────────
    describe("claim intent", () => {
        test("should map token being claimed", () => {
            const entities = {
                amounts: [],
                tokens: [{ symbol: "ARB", type: "fungible", rawText: "ARB", position: [10, 13] }],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "claim", "Claim my ARB airdrop");
            expect(params.inputToken).toBe("ARB");
        });

        test("should detect 'airdrop' claimType", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim my airdrop tokens");
            expect(params.claimType).toBe("airdrop");
        });

        test("should detect 'vesting' claimType", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim vesting tokens");
            expect(params.claimType).toBe("vesting");
        });

        test("should detect 'rewards' claimType from 'reward' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim staking rewards");
            expect(params.claimType).toBe("rewards");
        });

        test("should detect 'rewards' claimType from 'earn' keyword", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim earned tokens");
            expect(params.claimType).toBe("rewards");
        });

        test("should detect protocol name from known protocols", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim rewards from aave");
            expect(params.protocol).toBe("aave");
        });

        test("should detect eigenlayer as protocol", () => {
            const entities = { amounts: [], tokens: [], actions: [], constraints: [] };
            const params = mergeEntities(entities, "claim", "claim eigenlayer airdrop");
            expect(params.protocol).toBe("eigenlayer");
        });

        test("should detect amount for claim with specific quantity", () => {
            const entities = {
                amounts: [{ value: 500, rawText: "500", position: [6, 9] }],
                tokens: [{ symbol: "ARB", type: "fungible", rawText: "ARB", position: [10, 13] }],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "claim", "Claim 500 ARB vesting tokens");
            expect(params.inputAmount).toBe("500");
            expect(params.inputToken).toBe("ARB");
        });
    });

    // ─────────────────────────────────────────────────
    // Default / Unknown
    // ─────────────────────────────────────────────────
    describe("unknown intent (default case)", () => {
        test("should still extract amount and token in fallback", () => {
            const entities = {
                amounts: [{ value: 100, rawText: "100", position: [0, 3] }],
                tokens: [{ symbol: "USDC", type: "fungible", rawText: "USDC", position: [4, 8] }],
                actions: [],
                constraints: [],
            };
            const params = mergeEntities(entities, "unknown", "100 USDC something");
            expect(params.inputAmount).toBe("100");
            expect(params.inputToken).toBe("USDC");
        });
    });
});
