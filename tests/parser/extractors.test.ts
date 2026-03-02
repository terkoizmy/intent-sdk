import { describe, expect, test, beforeEach } from "bun:test";
import { AmountExtractor } from "../../src/parser/extractors/amount";
import { TokenExtractor } from "../../src/parser/extractors/token";
import { ActionExtractor } from "../../src/parser/extractors/action";
import { ConstraintExtractor } from "../../src/parser/extractors/constraints";

describe("Extractors", () => {
    describe("AmountExtractor", () => {
        const extractor = new AmountExtractor();

        test("should extract simple amounts", () => {
            const results = extractor.extract("Swap 1000 USDC");
            expect(results.length).toBe(1);
            expect(results[0].value).toBe(1000);
            expect(results[0].unit).toBe("USDC");
        });

        test("should extract k/m suffixes", () => {
            const results = extractor.extract("10k ETH and 1.5m DAI");
            expect(results.length).toBe(2);
            expect(results[0].value).toBe(10000);
            expect(results[1].value).toBe(1500000);
        });

        test("should extract decimal amounts", () => {
            const results = extractor.extract("0.5 BTC");
            expect(results[0].value).toBe(0.5);
        });

        test("should return empty array for text with no amounts", () => {
            const results = extractor.extract("hello world");
            expect(results.length).toBe(0);
        });
    });

    describe("TokenExtractor", () => {
        let extractor: TokenExtractor;

        beforeEach(() => {
            extractor = new TokenExtractor({
                "ETH": "0x...",
                "USDC": "0x...",
                "USDT": "0x..."
            });
        });

        test("should extract known tokens", () => {
            const results = extractor.extract("Swap USDC to ETH");
            expect(results.length).toBe(2);
            expect(results[0].symbol).toBe("USDC");
            expect(results[1].symbol).toBe("ETH");
        });

        test("should ignore common words", () => {
            const results = extractor.extract("I THE FOR AND");
            const symbols = results.map((r: any) => r.symbol);
            expect(symbols).not.toContain("THE");
            expect(symbols).not.toContain("FOR");
            expect(symbols).not.toContain("AND");
        });

        test("should detect NFT collections", () => {
            const results = extractor.extract("Buy Bored Ape Yacht Club for 10 ETH");
            const collections = results.filter(r => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Bored Ape Yacht Club");
        });

        test("should detect NFT collection aliases", () => {
            const results = extractor.extract("Swap Punks for Azuki");
            const collections = results.filter(r => r.type === "collection");
            expect(collections.length).toBe(2);
            const symbols = collections.map(c => c.symbol);
            expect(symbols).toContain("CryptoPunks"); // Canonical name for 'Punks'
            expect(symbols).toContain("Azuki");
        });
    });

    describe("ActionExtractor", () => {
        const extractor = new ActionExtractor();

        test("should extract swap actions", () => {
            const results = extractor.extract("I want to swap tokens");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].action).toBe("swap");
            expect(results[0].category).toBe("trade");
        });

        test("should extract yield actions", () => {
            const results = extractor.extract("Maximize my yield");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].action).toBe("maximize");
            expect(results[0].category).toBe("yield");
        });

        test("should return empty array for text with no actions", () => {
            const results = extractor.extract("hello world 123");
            expect(results.length).toBe(0);
        });
    });

    describe("ConstraintExtractor", () => {
        const extractor = new ConstraintExtractor();

        test("should extract slippage", () => {
            const results = extractor.extract("max 1% slippage");
            expect(results.length).toBe(1);
            expect(results[0].type).toBe("slippage");
            expect(results[0].value).toBe(100);
        });

        test("should extract decimal slippage", () => {
            const results = extractor.extract("0.5% slippage");
            expect(results.length).toBe(1);
            expect(results[0].value).toBe(50);
        });

        test("should return empty array for text with no constraints", () => {
            const results = extractor.extract("swap 100 USDC to ETH");
            expect(results.length).toBe(0);
        });
    });
});
