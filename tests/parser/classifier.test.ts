import { describe, expect, test } from "bun:test";
import { IntentClassifier } from "../../src/parser/classifiers/intent-classifier";

describe("IntentClassifier", () => {
    const classifier = new IntentClassifier();

    // ─────────────────────────────────────────────────
    // SWAP Classification
    // ─────────────────────────────────────────────────
    describe("swap intents", () => {
        test("should classify 'swap' keyword", () => {
            expect(classifier.classify("Swap 100 USDC to ETH")).toBe("swap");
        });

        test("should classify 'trade' keyword", () => {
            expect(classifier.classify("Trade my BTC for ETH")).toBe("swap");
        });

        test("should classify 'exchange' keyword", () => {
            expect(classifier.classify("Exchange 500 DAI to USDT")).toBe("swap");
        });

        test("should classify 'convert' keyword", () => {
            expect(classifier.classify("Convert all my USDC to ETH")).toBe("swap");
        });

        test("should classify swap case-insensitively", () => {
            expect(classifier.classify("SWAP tokens now")).toBe("swap");
            expect(classifier.classify("sWaP my crypto")).toBe("swap");
        });
    });

    // ─────────────────────────────────────────────────
    // YIELD STRATEGY Classification
    // ─────────────────────────────────────────────────
    describe("yield_strategy intents", () => {
        test("should classify 'yield' keyword", () => {
            expect(classifier.classify("Find the best yield for 10k USDC")).toBe("yield_strategy");
        });

        test("should classify 'stake' keyword", () => {
            expect(classifier.classify("Stake 5 ETH")).toBe("yield_strategy");
        });

        test("should classify 'earn' keyword", () => {
            expect(classifier.classify("Earn passive income with 1000 USDC")).toBe("yield_strategy");
        });

        test("should classify 'maximize' keyword", () => {
            expect(classifier.classify("Maximize my APY on stablecoins")).toBe("yield_strategy");
        });

        test("should classify 'apy' keyword", () => {
            expect(classifier.classify("What is the best apy for USDC?")).toBe("yield_strategy");
        });

        test("should classify 'farm' keyword", () => {
            expect(classifier.classify("Farm rewards with ETH-USDC LP")).toBe("yield_strategy");
        });
    });

    // ─────────────────────────────────────────────────
    // NFT PURCHASE Classification
    // ─────────────────────────────────────────────────
    describe("nft_purchase intents", () => {
        test("should classify 'buy NFT' pattern", () => {
            expect(classifier.classify("Buy an NFT from BAYC")).toBe("nft_purchase");
        });

        test("should classify 'purchase NFT' pattern", () => {
            expect(classifier.classify("Purchase a cool NFT")).toBe("nft_purchase");
        });

        test("should classify 'buy collection' pattern", () => {
            expect(classifier.classify("Buy from Azuki collection")).toBe("nft_purchase");
        });

        test("should classify 'mint' keyword", () => {
            expect(classifier.classify("Mint a new Doodles NFT")).toBe("nft_purchase");
        });
    });

    // ─────────────────────────────────────────────────
    // CLAIM Classification
    // ─────────────────────────────────────────────────
    describe("claim intents", () => {
        test("should classify 'claim' keyword", () => {
            expect(classifier.classify("Claim my airdrop tokens")).toBe("claim");
        });

        test("should classify 'collect rewards' pattern", () => {
            expect(classifier.classify("Collect my staking rewards")).toBe("claim");
        });

        test("should classify 'withdraw rewards' pattern", () => {
            expect(classifier.classify("Withdraw my rewards from Aave")).toBe("claim");
        });

        test("should classify 'vesting' keyword", () => {
            expect(classifier.classify("Check my vesting schedule")).toBe("claim");
        });

        test("should classify 'vested' keyword", () => {
            expect(classifier.classify("Claim vested tokens")).toBe("claim");
        });
    });

    // ─────────────────────────────────────────────────
    // SEND Classification
    // ─────────────────────────────────────────────────
    describe("send intents", () => {
        test("should classify 'send' keyword", () => {
            expect(classifier.classify("Send 0.5 ETH to 0x1234")).toBe("send");
        });

        test("should classify 'transfer' keyword", () => {
            expect(classifier.classify("Transfer 100 USDC to vitalik.eth")).toBe("send");
        });

        test("should classify 'pay' keyword", () => {
            expect(classifier.classify("Pay 50 DAI to 0xabcdef")).toBe("send");
        });
    });

    // ─────────────────────────────────────────────────
    // BRIDGE Classification
    // ─────────────────────────────────────────────────
    describe("bridge intents", () => {
        test("should classify 'bridge' keyword", () => {
            expect(classifier.classify("Bridge 100 USDC from Ethereum to Polygon")).toBe("bridge");
        });

        test("should classify 'cross-chain' keyword", () => {
            expect(classifier.classify("Cross-chain transfer 0.5 ETH to Arbitrum")).toBe("bridge");
        });

        test("should classify 'crosschain' (no hyphen)", () => {
            expect(classifier.classify("Crosschain move ETH to Base")).toBe("bridge");
        });
    });

    // ─────────────────────────────────────────────────
    // UNKNOWN Classification
    // ─────────────────────────────────────────────────
    describe("unknown intents", () => {
        test("should classify unrecognized text as unknown", () => {
            expect(classifier.classify("Hello world")).toBe("unknown");
        });

        test("should classify random gibberish as unknown", () => {
            expect(classifier.classify("asdfghjkl 12345")).toBe("unknown");
        });

        test("should classify empty-ish text as unknown", () => {
            expect(classifier.classify("   ")).toBe("unknown");
        });
    });

    // ─────────────────────────────────────────────────
    // Priority / Ambiguity
    // ─────────────────────────────────────────────────
    describe("priority handling", () => {
        test("should prioritize swap over send when 'swap' appears first", () => {
            // "swap" pattern is checked before "send", so "swap and send" → swap
            const result = classifier.classify("Swap and send tokens");
            expect(result).toBe("swap");
        });

        test("should detect bridge even when 'send' keyword present", () => {
            // "bridge" should be checked and found
            const result = classifier.classify("Bridge USDC to Polygon");
            expect(result).toBe("bridge");
        });
    });
});
