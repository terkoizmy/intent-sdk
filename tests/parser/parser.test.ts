import { describe, expect, test } from "bun:test";
import IntentParser from "../../src/parser";

describe("IntentParser", () => {
  const parser = new IntentParser();

  test("should parse simple swap intent", () => {
    const result = parser.parse("Swap 1000 USDC to ETH");

    expect(result.success).toBe(true);
    expect(result.data?.intentType).toBe("swap");
    expect(result.data?.parameters.inputToken).toBe("USDC");
    expect(result.data?.parameters.outputToken).toBe("ETH");
    expect(result.data?.parameters.inputAmount).toBe("1000");
    expect(result.data?.metadata.confidence).toBeGreaterThan(0);
    expect(result.data?.metadata.confidence).toBeLessThanOrEqual(1);
  });

  test("should parse yield strategy intent", () => {
    const result = parser.parse(
      "I want to maximize my yield on 10k USDC, but I'm worried about protocol risk. Can you split it across multiple safe protocols?",
    );

    expect(result.success).toBe(true);
    expect(result.data?.intentType).toBe("yield_strategy");
    expect(result.data?.parameters.inputToken).toBe("USDC");
    expect(result.data?.parameters.inputAmount).toBe("10000");
    expect(result.data?.parameters.riskLevel).toBe("low");
    expect(result.data?.parameters.diversificationRequired).toBe(true);
  });

  test("should parse NFT purchase intent", () => {
    const result = parser.parse(
      "Buy an NFT from Bored Ape collection with max 10 ETH",
    );

    expect(result.success).toBe(true);
    expect(result.data?.intentType).toBe("nft_purchase");
    expect(result.data?.parameters.collection).toContain("Bored Ape");
    expect(result.data?.parameters.maxPrice).toBe("10");
  });

  test("should handle unknown intent", () => {
    const result = parser.parse("Hello world");

    expect(result.success).toBe(true);
    expect(result.data?.intentType).toBe("unknown");
  });

  test("should extract slippage constraint", () => {
    const result = parser.parse("Swap 1000 USDC to ETH with max 1% slippage");

    expect(result.success).toBe(true);
    expect(result.data?.constraints.maxSlippage).toBe(100); // 1% = 100 basis points
  });
});
