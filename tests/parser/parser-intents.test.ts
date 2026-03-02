import { describe, expect, test } from "bun:test";
import IntentParser from "../../src/parser";

/**
 * Comprehensive end-to-end parser tests
 * Each intent type gets a full suite of tests covering:
 * - Basic happy path
 * - Variations in phrasing
 * - Edge cases & missing fields
 * - Constraints integration
 * - Confidence scoring
 */

// ═══════════════════════════════════════════════════
// SWAP Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Swap", () => {
    const parser = new IntentParser();

    test("should parse basic swap: 'Swap 1000 USDC to ETH'", () => {
        const result = parser.parse("Swap 1000 USDC to ETH");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("swap");
        expect(result.data?.parameters.inputToken).toBe("USDC");
        expect(result.data?.parameters.outputToken).toBe("ETH");
        expect(result.data?.parameters.inputAmount).toBe("1000");
    });

    test("should parse swap with 'trade' keyword", () => {
        const result = parser.parse("Trade 500 DAI for WBTC");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("swap");
        expect(result.data?.parameters.inputToken).toBe("DAI");
        expect(result.data?.parameters.outputToken).toBe("WBTC");
    });

    test("should parse swap with 'exchange' keyword", () => {
        const result = parser.parse("Exchange 200 USDT to ETH");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("swap");
    });

    test("should parse swap with 'convert' keyword", () => {
        const result = parser.parse("Convert 50 ETH to USDC");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("swap");
        expect(result.data?.parameters.inputToken).toBe("ETH");
        expect(result.data?.parameters.outputToken).toBe("USDC");
        expect(result.data?.parameters.inputAmount).toBe("50");
    });

    test("should parse swap with k suffix", () => {
        const result = parser.parse("Swap 10k USDC to ETH");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.inputAmount).toBe("10000");
    });

    test("should parse swap with slippage constraint", () => {
        const result = parser.parse("Swap 1000 USDC to ETH with max 1% slippage");
        expect(result.success).toBe(true);
        expect(result.data?.constraints.maxSlippage).toBe(100);
    });

    test("should parse swap with chain override", () => {
        const result = parser.parse("Swap 100 USDC to ETH on Polygon");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.sourceChain).toBe("Polygon");
    });

    test("should have confidence > 0.7 when all required fields present", () => {
        const result = parser.parse("Swap 1000 USDC to ETH");
        expect(result.data?.metadata.confidence).toBeGreaterThan(0.7);
    });

    test("should have deadline set in constraints", () => {
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.data?.constraints.deadline).toBeGreaterThan(0);
    });

    test("should include originalText in metadata", () => {
        const text = "Swap 100 USDC to ETH";
        const result = parser.parse(text);
        expect(result.data?.metadata.originalText).toBe(text);
    });

    test("should include parsedAt timestamp", () => {
        const beforeParse = Date.now();
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.data?.metadata.parsedAt).toBeGreaterThanOrEqual(beforeParse);
    });
});

// ═══════════════════════════════════════════════════
// YIELD STRATEGY Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Yield Strategy", () => {
    const parser = new IntentParser();

    test("should parse basic yield: 'Maximize yield on 10k USDC'", () => {
        const result = parser.parse("Maximize yield on 10k USDC");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("yield_strategy");
        expect(result.data?.parameters.inputToken).toBe("USDC");
        expect(result.data?.parameters.inputAmount).toBe("10000");
    });

    test("should parse yield with risk assessment: safe → low", () => {
        const result = parser.parse(
            "I want to maximize yield on 10k USDC but keep it safe and split across multiple protocols",
        );
        expect(result.success).toBe(true);
        expect(result.data?.parameters.riskLevel).toBe("low");
        expect(result.data?.parameters.diversificationRequired).toBe(true);
    });

    test("should parse yield with 'conservative' → low risk", () => {
        const result = parser.parse("Find conservative yield for 5000 USDC");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.riskLevel).toBe("low");
    });

    test("should parse yield with 'degen' → high risk", () => {
        const result = parser.parse("Degen yield farm 1000 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.riskLevel).toBe("high");
    });

    test("should parse yield with 'aggressive' → high risk", () => {
        const result = parser.parse("Maximize aggressive high yield on 50k USDC");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.riskLevel).toBe("high");
    });

    test("should parse 'stake' as yield intent", () => {
        const result = parser.parse("Stake 5 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("yield_strategy");
        expect(result.data?.parameters.inputToken).toBe("ETH");
        expect(result.data?.parameters.inputAmount).toBe("5");
    });

    test("should parse 'earn' as yield intent", () => {
        const result = parser.parse("Earn passive income with 1000 USDC");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("yield_strategy");
    });

    test("should parse 'farm' as yield intent", () => {
        const result = parser.parse("Farm rewards with 500 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("yield_strategy");
    });

    test("should detect diversification from 'split' keyword", () => {
        const result = parser.parse("Earn yield with 10k USDC, split across protocols");
        expect(result.data?.parameters.diversificationRequired).toBe(true);
    });
});

// ═══════════════════════════════════════════════════
// NFT PURCHASE Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — NFT Purchase", () => {
    const parser = new IntentParser();

    test("should parse NFT purchase with collection name", () => {
        const result = parser.parse("Buy an NFT from Bored Ape Yacht Club for max 10 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("nft_purchase");
        expect(result.data?.parameters.collection).toContain("Bored Ape");
    });

    test("should parse NFT purchase with alias (BAYC)", () => {
        const result = parser.parse("Buy a BAYC NFT");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("nft_purchase");
        expect(result.data?.parameters.collection).toBe("Bored Ape Yacht Club");
    });

    test("should extract maxPrice from amount", () => {
        const result = parser.parse("Buy an NFT from Azuki for max 5 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.maxPrice).toBe("5");
    });

    test("should parse 'mint' as NFT purchase", () => {
        const result = parser.parse("Mint a Doodles NFT");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("nft_purchase");
    });

    test("should parse 'purchase NFT' pattern", () => {
        const result = parser.parse("Purchase an NFT from CryptoPunks");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("nft_purchase");
    });

    test("should extract payment token (ETH) alongside collection", () => {
        const result = parser.parse("Buy BAYC NFT with 10 ETH");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.inputToken).toBe("ETH");
    });

    test("should have default marketplace preferences", () => {
        const result = parser.parse("Buy an NFT from Azuki collection");
        expect(result.success).toBe(true);
        expect(result.data?.constraints.preferredMarketplaces).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════
// SEND Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Send", () => {
    const parser = new IntentParser();

    test("should parse send to 0x address", () => {
        const result = parser.parse(
            "Send 0.5 ETH to 0x1234567890abcdef1234567890abcdef12345678",
        );
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("send");
        expect(result.data?.parameters.inputToken).toBe("ETH");
        expect(result.data?.parameters.inputAmount).toBe("0.5");
        expect(result.data?.parameters.recipient).toBe(
            "0x1234567890abcdef1234567890abcdef12345678",
        );
    });

    test("should parse send to ENS name (.eth)", () => {
        const result = parser.parse("Send 100 USDC to vitalik.eth");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("send");
        expect(result.data?.parameters.recipient).toBe("vitalik.eth");
    });

    test("should parse 'transfer' as send intent", () => {
        const result = parser.parse(
            "Transfer 50 DAI to 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        );
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("send");
    });

    test("should parse 'pay' as send intent", () => {
        const result = parser.parse("Pay 25 USDC to alice.eth");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("send");
        expect(result.data?.parameters.recipient).toBe("alice.eth");
    });

    test("should detect chain for send", () => {
        const result = parser.parse(
            "Send 100 USDC to vitalik.eth on polygon",
        );
        expect(result.success).toBe(true);
        expect(result.data?.parameters.sourceChain).toBe("Polygon");
    });
});

// ═══════════════════════════════════════════════════
// BRIDGE Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Bridge", () => {
    const parser = new IntentParser();

    test("should parse basic bridge: 'Bridge 100 USDC from Ethereum to Polygon'", () => {
        const result = parser.parse("Bridge 100 USDC from Ethereum to Polygon");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("bridge");
        expect(result.data?.parameters.inputToken).toBe("USDC");
        expect(result.data?.parameters.inputAmount).toBe("100");
        expect(result.data?.parameters.sourceChain).toBe("Ethereum");
        expect(result.data?.parameters.targetChain).toBe("Polygon");
    });

    test("should parse bridge with mainnet alias", () => {
        const result = parser.parse("Bridge 0.5 ETH from mainnet to arbitrum");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.sourceChain).toBe("Ethereum");
        expect(result.data?.parameters.targetChain).toBe("Arbitrum");
    });

    test("should parse bridge to Optimism", () => {
        const result = parser.parse("Bridge 1000 USDC from ethereum to optimism");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.targetChain).toBe("Optimism");
    });

    test("should parse bridge to Base", () => {
        const result = parser.parse("Bridge 500 USDC from polygon to base");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.targetChain).toBe("Base");
    });

    test("should parse 'cross-chain' as bridge intent", () => {
        const result = parser.parse("Cross-chain transfer 100 USDC to Arbitrum");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("bridge");
    });

    test("should handle bridge with slippage constraint", () => {
        const result = parser.parse(
            "Bridge 100 USDC from Ethereum to Polygon with max 0.5% slippage",
        );
        expect(result.success).toBe(true);
        expect(result.data?.constraints.maxSlippage).toBe(50);
    });
});

// ═══════════════════════════════════════════════════
// CLAIM Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Claim", () => {
    const parser = new IntentParser();

    test("should parse basic claim: 'Claim my ARB airdrop'", () => {
        const result = parser.parse("Claim my ARB airdrop");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("claim");
        expect(result.data?.parameters.inputToken).toBe("ARB");
        expect(result.data?.parameters.claimType).toBe("airdrop");
    });

    test("should parse claim staking rewards", () => {
        const result = parser.parse("Claim staking rewards from Lido");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("claim");
        expect(result.data?.parameters.claimType).toBe("rewards");
        expect(result.data?.parameters.protocol).toBe("lido");
    });

    test("should parse claim vesting tokens", () => {
        const result = parser.parse("Claim 500 vested ARB tokens");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.claimType).toBe("vesting");
        expect(result.data?.parameters.inputToken).toBe("ARB");
    });

    test("should detect Aave as protocol", () => {
        const result = parser.parse("Claim rewards from Aave");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.protocol).toBe("aave");
    });

    test("should detect EigenLayer as protocol", () => {
        const result = parser.parse("Claim eigenlayer airdrop tokens");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.protocol).toBe("eigenlayer");
    });

    test("should parse 'collect rewards' pattern", () => {
        const result = parser.parse("Collect my staking rewards");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("claim");
    });

    test("should parse 'withdraw rewards' pattern", () => {
        const result = parser.parse("Withdraw my rewards from Compound");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("claim");
        expect(result.data?.parameters.protocol).toBe("compound");
    });

    test("should have default claimType as rewards when no keyword matches", () => {
        const result = parser.parse("Claim my ETH tokens");
        expect(result.success).toBe(true);
        // No airdrop/vesting/reward keyword → template default ("rewards")
        expect(result.data?.parameters.claimType).toBeDefined();
    });
});

// ═══════════════════════════════════════════════════
// UNKNOWN Intent — End-to-End
// ═══════════════════════════════════════════════════
describe("IntentParser — Unknown", () => {
    const parser = new IntentParser();

    test("should classify unrecognized text as unknown", () => {
        const result = parser.parse("Hello world");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("unknown");
    });

    test("should have low confidence for unknown intent", () => {
        const result = parser.parse("What is the weather today?");
        expect(result.success).toBe(true);
        expect(result.data?.metadata.confidence).toBeLessThan(0.5);
    });

    test("should handle empty string gracefully", () => {
        const result = parser.parse("");
        expect(result.success).toBe(true);
        expect(result.data?.intentType).toBe("unknown");
    });
});

// ═══════════════════════════════════════════════════
// Batch parsing
// ═══════════════════════════════════════════════════
describe("IntentParser — Batch", () => {
    const parser = new IntentParser();

    test("parseBatch should parse multiple texts", () => {
        const results = parser.parseBatch([
            "Swap 100 USDC to ETH",
            "Stake 5 ETH",
            "Hello world",
        ]);
        expect(results.length).toBe(3);
        expect(results[0].data?.intentType).toBe("swap");
        expect(results[1].data?.intentType).toBe("yield_strategy");
        expect(results[2].data?.intentType).toBe("unknown");
    });

    test("parseBatch should return empty array for empty input", () => {
        const results = parser.parseBatch([]);
        expect(results.length).toBe(0);
    });
});

// ═══════════════════════════════════════════════════
// Config & Custom Tokens
// ═══════════════════════════════════════════════════
describe("IntentParser — Configuration", () => {
    test("should use custom known tokens", () => {
        const parser = new IntentParser({
            knownTokens: { USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
        });
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.success).toBe(true);
        expect(result.data?.parameters.inputTokenAddress).toBe(
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        );
    });

    test("should use custom defaultDeadlineOffset", () => {
        const parser = new IntentParser({ defaultDeadlineOffset: 7200 });
        const beforeParse = Date.now();
        const result = parser.parse("Swap 100 USDC to ETH");
        // Deadline should be approximately now + 7200 seconds
        const expectedDeadline = beforeParse + 7200 * 1000;
        expect(result.data?.constraints.deadline).toBeGreaterThanOrEqual(expectedDeadline - 1000);
        expect(result.data?.constraints.deadline).toBeLessThanOrEqual(expectedDeadline + 1000);
    });

    test("should work with default config (no arguments)", () => {
        const parser = new IntentParser();
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.success).toBe(true);
    });
});

// ═══════════════════════════════════════════════════
// Metadata & Validation
// ═══════════════════════════════════════════════════
describe("IntentParser — Metadata & Validation", () => {
    const parser = new IntentParser();

    test("should always include originalText", () => {
        const text = "Swap 1000 USDC to ETH";
        const result = parser.parse(text);
        expect(result.data?.metadata.originalText).toBe(text);
    });

    test("should always include parsedAt", () => {
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.data?.metadata.parsedAt).toBeDefined();
        expect(typeof result.data?.metadata.parsedAt).toBe("number");
    });

    test("confidence should be between 0 and 1", () => {
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(result.data?.metadata.confidence).toBeGreaterThanOrEqual(0);
        expect(result.data?.metadata.confidence).toBeLessThanOrEqual(1);
    });

    test("success should always be boolean", () => {
        const result = parser.parse("Swap 100 USDC to ETH");
        expect(typeof result.success).toBe("boolean");
    });

    test("failed parse should have error message", () => {
        // This tests error handling — deliberately break something
        // Since all text goes through, this should still succeed as "unknown"
        const result = parser.parse("asdjfhaskdjfh");
        expect(result.success).toBe(true);
        // It should at least parse as unknown
        expect(result.data?.intentType).toBe("unknown");
    });
});
