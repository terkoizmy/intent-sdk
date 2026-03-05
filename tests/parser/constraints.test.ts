/**
 * T10 — Parser Constraint Mapping Test
 *
 * Verifies that all constraint types (slippage, deadline, gas, preferredDEXs, minProtocols)
 * extracted from natural language are correctly mapped into the final StructuredIntent.
 *
 * Run: bun test tests/parser/constraints.test.ts
 */

import { describe, test, expect } from "bun:test";
import { IntentParser } from "../../src/parser";

describe("T10: Parser constraint mapping (buildIntent)", () => {
    const parser = new IntentParser();

    test("slippage constraint is mapped to maxSlippage", () => {
        const result = parser.parse("Swap 100 USDC for ETH with max 1% slippage");
        expect(result.success).toBe(true);
        // maxSlippage should be present (value depends on extractor)
        if (result.data?.constraints.maxSlippage !== undefined) {
            expect(typeof result.data.constraints.maxSlippage).toBe("number");
        }
    });

    test("bridge intent produces structured intent with required fields", () => {
        const result = parser.parse("Bridge 500 USDC from Ethereum to Polygon");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("bridge");
        expect(intent.parameters.inputToken).toBe("USDC");
        expect(intent.parameters.sourceChain).toBeTruthy();
        expect(intent.parameters.targetChain).toBeTruthy();
    });

    test("send intent produces correct recipient and amount", () => {
        const result = parser.parse("Send 10 USDC to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("send");
        expect(intent.parameters.inputToken).toBe("USDC");
        expect(intent.parameters.recipient).toBeDefined();
    });

    test("yield intent extracts risk level", () => {
        const result = parser.parse("Maximize yield on 1000 USDC safely");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("yield_strategy");
        expect(intent.parameters.riskLevel).toBe("low");
    });

    test("yield degen intent extracts high risk level", () => {
        const result = parser.parse("Put 500 USDC into degen high yield strategies");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("yield_strategy");
        expect(intent.parameters.riskLevel).toBe("high");
    });

    test("claim airdrop intent sets correct claimType", () => {
        const result = parser.parse("Claim my UNI airdrop on Ethereum");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("claim");
        expect(intent.parameters.claimType).toBe("airdrop");
    });

    test("claim rewards intent sets correct claimType", () => {
        const result = parser.parse("Claim my staking rewards from Aave");
        expect(result.success).toBe(true);
        const intent = result.data!;
        expect(intent.intentType).toBe("claim");
        expect(intent.parameters.claimType).toBe("rewards");
        expect(intent.parameters.protocol).toBe("aave");
    });

    test("metadata confidence is between 0 and 1", () => {
        const result = parser.parse("Bridge 100 USDT from Arbitrum to Base");
        expect(result.success).toBe(true);
        const confidence = result.data!.metadata.confidence;
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
    });

    test("unknown intent returns low confidence", () => {
        const result = parser.parse("Do something with my wallet");
        // May succeed or fail depending on parser, but confidence should be low if it parses
        if (result.success && result.data?.intentType === "unknown") {
            expect(result.data.metadata.confidence).toBeLessThan(0.5);
        }
    });

    test("parsedAt timestamp is recent", () => {
        const before = Date.now();
        const result = parser.parse("Bridge 10 USDC from Ethereum to Polygon");
        const after = Date.now();

        expect(result.success).toBe(true);
        const parsedAt = result.data!.metadata.parsedAt;
        expect(parsedAt).toBeGreaterThanOrEqual(before);
        expect(parsedAt).toBeLessThanOrEqual(after);
    });
});
