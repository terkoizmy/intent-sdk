import { describe, expect, test, beforeEach } from "bun:test";
import { AmountExtractor } from "../../src/parser/extractors/amount";
import { TokenExtractor } from "../../src/parser/extractors/token";
import { ActionExtractor } from "../../src/parser/extractors/action";
import { ConstraintExtractor } from "../../src/parser/extractors/constraints";

// ═══════════════════════════════════════════════════
// AmountExtractor — Detailed Tests
// ═══════════════════════════════════════════════════
describe("AmountExtractor (detailed)", () => {
    const extractor = new AmountExtractor();

    describe("basic numeric parsing", () => {
        test("should extract integer amount", () => {
            const results = extractor.extract("Send 500 USDC");
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].value).toBe(500);
        });

        test("should extract decimal amount", () => {
            const results = extractor.extract("Send 0.001 ETH");
            expect(results[0].value).toBe(0.001);
        });

        test("should extract large numbers", () => {
            const results = extractor.extract("Swap 1000000 USDC");
            expect(results[0].value).toBe(1000000);
        });

        test("should extract zero amount", () => {
            const results = extractor.extract("0 USDC");
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].value).toBe(0);
        });
    });

    describe("suffix handling (k/m)", () => {
        test("should parse 'k' suffix as thousands", () => {
            const results = extractor.extract("10k USDC");
            expect(results[0].value).toBe(10000);
        });

        test("should parse 'm' suffix as millions", () => {
            const results = extractor.extract("1.5m DAI");
            expect(results[0].value).toBe(1500000);
        });

        test("should handle decimal with k suffix", () => {
            const results = extractor.extract("2.5k ETH");
            expect(results[0].value).toBe(2500);
        });

        test("should handle 'K' (uppercase) suffix", () => {
            const results = extractor.extract("5K USDC");
            // Should still parse correctly (case-insensitive for k/m)
            expect(results[0].value).toBe(5000);
        });
    });

    describe("unit (token symbol) extraction", () => {
        test("should extract token symbol as unit", () => {
            const results = extractor.extract("1000 USDC");
            expect(results[0].unit).toBe("USDC");
        });

        test("should extract amount without unit", () => {
            const text = "send 42 tokens";
            const results = extractor.extract(text);
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].value).toBe(42);
        });
    });

    describe("multiple amounts", () => {
        test("should extract multiple amounts in one sentence", () => {
            const results = extractor.extract("Swap 100 USDC to get at least 0.05 ETH");
            expect(results.length).toBeGreaterThanOrEqual(2);
            const values = results.map((r) => r.value);
            expect(values).toContain(100);
            expect(values).toContain(0.05);
        });

        test("should keep amounts in order by position", () => {
            const results = extractor.extract("10k ETH and 1.5m DAI");
            expect(results[0].value).toBe(10000);
            expect(results[1].value).toBe(1500000);
        });
    });

    describe("position tracking", () => {
        test("should track position of extracted amount", () => {
            const results = extractor.extract("Swap 1000 USDC");
            expect(results[0].position).toBeDefined();
            expect(results[0].position[0]).toBeGreaterThanOrEqual(0);
            expect(results[0].position[1]).toBeGreaterThan(results[0].position[0]);
        });
    });

    describe("edge cases", () => {
        test("should return empty array for text with no numbers", () => {
            const results = extractor.extract("hello world foo bar");
            expect(results.length).toBe(0);
        });

        test("should handle empty string", () => {
            const results = extractor.extract("");
            expect(results.length).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════
// TokenExtractor — Detailed Tests
// ═══════════════════════════════════════════════════
describe("TokenExtractor (detailed)", () => {
    describe("fungible token extraction", () => {
        let extractor: TokenExtractor;

        beforeEach(() => {
            extractor = new TokenExtractor({
                ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
            });
        });

        test("should extract single token", () => {
            const results = extractor.extract("Buy some ETH");
            const fungible = results.filter((r) => r.type === "fungible");
            expect(fungible.length).toBeGreaterThanOrEqual(1);
            expect(fungible[0].symbol).toBe("ETH");
        });

        test("should extract multiple tokens", () => {
            const results = extractor.extract("Swap USDC to ETH");
            const symbols = results.map((r) => r.symbol);
            expect(symbols).toContain("USDC");
            expect(symbols).toContain("ETH");
        });

        test("should attach address for known tokens", () => {
            const results = extractor.extract("Buy ETH");
            const ethToken = results.find((r) => r.symbol === "ETH");
            expect(ethToken?.address).toBe("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        });

        test("should extract tokens without known address", () => {
            const results = extractor.extract("Swap to ARB");
            const arb = results.find((r) => r.symbol === "ARB");
            expect(arb).toBeDefined();
            expect(arb?.address).toBeUndefined();
        });

        test("should set type to 'fungible' for regular tokens", () => {
            const results = extractor.extract("Swap USDC to ETH");
            const fungible = results.filter((r) => r.type === "fungible");
            expect(fungible.length).toBe(2);
        });
    });

    describe("common word filtering", () => {
        let extractor: TokenExtractor;

        beforeEach(() => {
            extractor = new TokenExtractor();
        });

        test("should filter out common English words (TO, FROM, WITH, etc.)", () => {
            const results = extractor.extract("Send FROM this TO that WITH speed");
            const symbols = results.map((r) => r.symbol);
            expect(symbols).not.toContain("TO");
            expect(symbols).not.toContain("FROM");
            expect(symbols).not.toContain("WITH");
        });

        test("should filter out action words (SWAP, BUY, SELL, etc.)", () => {
            const results = extractor.extract("SWAP BUY SELL SEND BRIDGE CLAIM STAKE");
            const symbols = results.map((r) => r.symbol);
            expect(symbols).not.toContain("SWAP");
            expect(symbols).not.toContain("BUY");
            expect(symbols).not.toContain("SELL");
            expect(symbols).not.toContain("SEND");
            expect(symbols).not.toContain("BRIDGE");
            expect(symbols).not.toContain("CLAIM");
            expect(symbols).not.toContain("STAKE");
        });

        test("should filter MAX and MIN", () => {
            const results = extractor.extract("MAX yield MIN risk");
            const symbols = results.map((r) => r.symbol);
            expect(symbols).not.toContain("MAX");
            expect(symbols).not.toContain("MIN");
        });
    });

    describe("NFT collection detection", () => {
        let extractor: TokenExtractor;

        beforeEach(() => {
            extractor = new TokenExtractor();
        });

        test("should detect full collection name 'Bored Ape Yacht Club'", () => {
            const results = extractor.extract("Buy Bored Ape Yacht Club NFT");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Bored Ape Yacht Club");
        });

        test("should detect alias 'BAYC'", () => {
            const results = extractor.extract("Buy BAYC");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Bored Ape Yacht Club");
        });

        test("should detect 'CryptoPunks' via alias 'Punks'", () => {
            const results = extractor.extract("Buy a Punks NFT");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("CryptoPunks");
        });

        test("should detect 'Azuki'", () => {
            const results = extractor.extract("Mint an Azuki");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Azuki");
        });

        test("should detect 'Pudgy Penguins' via alias 'Pudgy'", () => {
            const results = extractor.extract("Buy Pudgy NFT");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Pudgy Penguins");
        });

        test("should detect multiple NFT collections in one text", () => {
            const results = extractor.extract("Compare BAYC and Azuki floor prices");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(2);
            const symbols = collections.map((c) => c.symbol);
            expect(symbols).toContain("Bored Ape Yacht Club");
            expect(symbols).toContain("Azuki");
        });

        test("should prefer longer match over shorter overlapping alias", () => {
            // "Bored Ape Yacht Club" should be preferred over just "Bored Ape"
            const results = extractor.extract("Buy Bored Ape Yacht Club");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("Bored Ape Yacht Club");
        });

        test("should not duplicate NFT tokens as fungible tokens", () => {
            const results = extractor.extract("Buy BAYC for 10 ETH");
            // BAYC should only appear once as a collection, not also as fungible
            const baycResults = results.filter(
                (r) => r.symbol === "Bored Ape Yacht Club" || r.rawText === "BAYC",
            );
            expect(baycResults.length).toBe(1);
            expect(baycResults[0].type).toBe("collection");
        });
    });

    describe("custom collections via constructor", () => {
        test("should use custom collections when provided", () => {
            const extractor = new TokenExtractor({}, [
                { name: "My Custom Collection", aliases: ["MCC"] },
            ]);
            const results = extractor.extract("Buy MCC NFT");
            const collections = results.filter((r) => r.type === "collection");
            expect(collections.length).toBe(1);
            expect(collections[0].symbol).toBe("My Custom Collection");
        });
    });

    describe("position tracking", () => {
        test("should track position for fungible tokens", () => {
            const extractor = new TokenExtractor();
            const results = extractor.extract("Swap USDC to ETH");
            for (const r of results) {
                expect(r.position).toBeDefined();
                expect(r.position![0]).toBeGreaterThanOrEqual(0);
                expect(r.position![1]).toBeGreaterThan(r.position![0]);
            }
        });
    });

    describe("edge cases", () => {
        test("should return empty array for text with no tokens", () => {
            const extractor = new TokenExtractor();
            const results = extractor.extract("hello world 123");
            expect(results.length).toBe(0);
        });

        test("should handle empty string", () => {
            const extractor = new TokenExtractor();
            const results = extractor.extract("");
            expect(results.length).toBe(0);
        });

        test("should not match single-letter uppercase words", () => {
            const extractor = new TokenExtractor();
            const results = extractor.extract("I A B");
            // Symbols must be >= 2 chars
            expect(results.length).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════
// ActionExtractor — Detailed Tests
// ═══════════════════════════════════════════════════
describe("ActionExtractor (detailed)", () => {
    const extractor = new ActionExtractor();

    describe("trade actions", () => {
        test("should extract 'swap' action", () => {
            const results = extractor.extract("swap my tokens");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].action).toBe("swap");
            expect(results[0].category).toBe("trade");
        });

        test("should extract 'trade' action", () => {
            const results = extractor.extract("I want to trade ETH");
            const trade = results.find((r) => r.action === "trade");
            expect(trade).toBeDefined();
            expect(trade?.category).toBe("trade");
        });

        test("should extract 'exchange' action", () => {
            const results = extractor.extract("exchange USDC for DAI");
            const exchange = results.find((r) => r.action === "exchange");
            expect(exchange).toBeDefined();
            expect(exchange?.category).toBe("trade");
        });

        test("should extract 'convert' action", () => {
            const results = extractor.extract("convert my stablecoins");
            const convert = results.find((r) => r.action === "convert");
            expect(convert).toBeDefined();
        });

        test("should extract 'swapping' as 'swap'", () => {
            const results = extractor.extract("I am swapping tokens");
            const swap = results.find((r) => r.action === "swap");
            expect(swap).toBeDefined();
        });
    });

    describe("yield actions", () => {
        test("should extract 'maximize' as yield", () => {
            const results = extractor.extract("Maximize my yield");
            const maximize = results.find((r) => r.action === "maximize");
            expect(maximize).toBeDefined();
            expect(maximize?.category).toBe("yield");
        });

        test("should extract 'earn' as yield", () => {
            const results = extractor.extract("earn passive income");
            const earn = results.find((r) => r.action === "earn");
            expect(earn).toBeDefined();
            expect(earn?.category).toBe("yield");
        });

        test("should extract 'stake' as yield", () => {
            const results = extractor.extract("Stake 10 ETH");
            const stake = results.find((r) => r.action === "stake");
            expect(stake).toBeDefined();
            expect(stake?.category).toBe("yield");
        });

        test("should extract 'farm' as yield", () => {
            const results = extractor.extract("Farm rewards on Curve");
            const farm = results.find((r) => r.action === "farm");
            expect(farm).toBeDefined();
            expect(farm?.category).toBe("yield");
        });
    });

    describe("purchase actions", () => {
        test("should extract 'buy' as purchase", () => {
            const results = extractor.extract("buy an NFT");
            const buy = results.find((r) => r.action === "buy");
            expect(buy).toBeDefined();
            expect(buy?.category).toBe("purchase");
        });

        test("should extract 'purchase' as purchase", () => {
            const results = extractor.extract("Purchase a CryptoPunk");
            const purchase = results.find((r) => r.action === "purchase");
            expect(purchase).toBeDefined();
        });

        test("should extract 'mint' as purchase", () => {
            const results = extractor.extract("Mint the new collection");
            const mint = results.find((r) => r.action === "mint");
            expect(mint).toBeDefined();
            expect(mint?.category).toBe("purchase");
        });
    });

    describe("transfer actions", () => {
        test("should extract 'send' as transfer", () => {
            const results = extractor.extract("send 100 USDC");
            const send = results.find((r) => r.action === "send");
            expect(send).toBeDefined();
            expect(send?.category).toBe("transfer");
        });

        test("should extract 'transfer' as transfer", () => {
            const results = extractor.extract("Transfer tokens to vitalik.eth");
            const transfer = results.find((r) => r.action === "transfer");
            expect(transfer).toBeDefined();
        });

        test("should extract 'pay' as transfer", () => {
            const results = extractor.extract("Pay 50 DAI to 0xabc");
            const pay = results.find((r) => r.action === "pay");
            expect(pay).toBeDefined();
            expect(pay?.category).toBe("transfer");
        });
    });

    describe("multiple actions", () => {
        test("should extract multiple actions from one sentence", () => {
            const results = extractor.extract("swap and send my tokens");
            expect(results.length).toBeGreaterThanOrEqual(2);
            const actions = results.map((r) => r.action);
            expect(actions).toContain("swap");
            expect(actions).toContain("send");
        });
    });

    describe("position tracking", () => {
        test("should include position for each action", () => {
            const results = extractor.extract("swap tokens now");
            expect(results[0].position).toBeDefined();
            expect(results[0].position[0]).toBeGreaterThanOrEqual(0);
        });
    });

    describe("edge cases", () => {
        test("should return empty for text with no actions", () => {
            const results = extractor.extract("hello 123 world");
            expect(results.length).toBe(0);
        });

        test("should return empty for empty string", () => {
            const results = extractor.extract("");
            expect(results.length).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════
// ConstraintExtractor — Detailed Tests
// ═══════════════════════════════════════════════════
describe("ConstraintExtractor (detailed)", () => {
    const extractor = new ConstraintExtractor();

    describe("slippage extraction", () => {
        test("should extract 'max 1% slippage'", () => {
            const results = extractor.extract("max 1% slippage");
            expect(results.length).toBe(1);
            expect(results[0].type).toBe("slippage");
            expect(results[0].value).toBe(100); // 1% = 100 basis points
        });

        test("should extract 'maximum 2% slippage'", () => {
            const results = extractor.extract("maximum 2% slippage");
            expect(results.length).toBe(1);
            expect(results[0].value).toBe(200);
        });

        test("should extract '0.5% slippage'", () => {
            const results = extractor.extract("0.5% slippage");
            expect(results.length).toBe(1);
            expect(results[0].value).toBe(50);
        });

        test("should extract '0.1 slippage' (without %)", () => {
            const results = extractor.extract("0.1 slippage");
            expect(results.length).toBe(1);
            expect(results[0].value).toBe(10);
        });

        test("should include rawText for slippage", () => {
            const results = extractor.extract("with max 1% slippage please");
            expect(results[0].rawText).toContain("slippage");
        });
    });

    describe("deadline extraction", () => {
        test("should extract 'within 1 hour' as 3600 seconds", () => {
            const results = extractor.extract("swap within 1 hour");
            const deadline = results.find((r) => r.type === "deadline");
            expect(deadline).toBeDefined();
            expect(deadline?.value).toBe(3600);
        });

        test("should extract 'in 30 minutes' as 1800 seconds", () => {
            const results = extractor.extract("finish in 30 minutes");
            const deadline = results.find((r) => r.type === "deadline");
            expect(deadline).toBeDefined();
            expect(deadline?.value).toBe(1800);
        });

        test("should extract 'within 2 days' as 172800 seconds", () => {
            const results = extractor.extract("complete within 2 days");
            const deadline = results.find((r) => r.type === "deadline");
            expect(deadline).toBeDefined();
            expect(deadline?.value).toBe(172800);
        });

        test("should extract 'in 10 seconds'", () => {
            const results = extractor.extract("do it in 10 seconds");
            const deadline = results.find((r) => r.type === "deadline");
            expect(deadline).toBeDefined();
            expect(deadline?.value).toBe(10);
        });

        test("should handle abbreviated time units ('hr', 'min', 'sec')", () => {
            const results1 = extractor.extract("in 2 hrs");
            const d1 = results1.find((r) => r.type === "deadline");
            expect(d1?.value).toBe(7200);

            const results2 = extractor.extract("within 5 min");
            const d2 = results2.find((r) => r.type === "deadline");
            expect(d2?.value).toBe(300);
        });
    });

    describe("gas constraint extraction", () => {
        test("should extract gas limit in ETH", () => {
            const results = extractor.extract("gas cost 0.01 ETH");
            const gas = results.find((r) => r.type === "gas");
            expect(gas).toBeDefined();
            expect(gas?.value).toBe(0.01);
        });

        test("should extract gas limit in gwei and convert to ETH", () => {
            const results = extractor.extract("gas fee 50 gwei");
            const gas = results.find((r) => r.type === "gas");
            expect(gas).toBeDefined();
            // 50 gwei = 50 * 1e-9 ETH
            expect(gas?.value).toBeCloseTo(50e-9, 15);
        });
    });

    describe("multiple constraints", () => {
        test("should extract both slippage and deadline", () => {
            const results = extractor.extract("max 1% slippage within 1 hour");
            expect(results.length).toBeGreaterThanOrEqual(2);
            const types = results.map((r) => r.type);
            expect(types).toContain("slippage");
            expect(types).toContain("deadline");
        });
    });

    describe("edge cases", () => {
        test("should return empty for text with no constraints", () => {
            const results = extractor.extract("swap 100 USDC to ETH");
            expect(results.length).toBe(0);
        });

        test("should return empty for empty string", () => {
            const results = extractor.extract("");
            expect(results.length).toBe(0);
        });
    });
});
