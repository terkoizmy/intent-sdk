/**
 * Phase D: Live Li.Fi API Integration Tests
 *
 * This test suite validates real HTTP interaction with the Li.Fi API
 * used for cross-chain rebalancing.
 * 
 * Li.Fi does NOT require an API key for basic quoting and transaction building.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { LiFiProtocol } from "../../src/solver/protocols/aggregators/lifi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ETHEREUM_CHAIN_ID = 1;
const POLYGON_CHAIN_ID = 137;
const USDC_DECIMALS = 6n;
const ONE_USDC = 10n ** USDC_DECIMALS;

// Dummy addresses for testing
const VITALIK_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ANOTHER_ADDRESS = "0x00000000219ab540356cBB839Cbe05303d7705Fa";

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Phase D: Live Li.Fi API Integration", () => {
    let lifi: LiFiProtocol;

    beforeAll(() => {
        // Initialize LiFi Protocol
        lifi = new LiFiProtocol();
    });

    test("should get quote using real API (without fromAddress)", async () => {
        const quote = await lifi.quote({
            fromChain: ETHEREUM_CHAIN_ID,
            toChain: POLYGON_CHAIN_ID,
            token: "USDC",
            amount: ONE_USDC * 10n, // 10 USDC
            slippagePercent: 1, // 1%
        });

        expect(quote).toBeDefined();
        expect(quote.protocolName).toBe("Li.Fi");
        expect(quote.inputAmount).toBe(ONE_USDC * 10n);
        expect(quote.outputAmount).toBeGreaterThan(0n); // Output exists
        expect(quote.estimatedTimeMs).toBeGreaterThan(0);

        // Fee might be 0 or populated depending on the route, but it should be a bigint
        expect(typeof quote.fee).toBe("bigint");
    });

    test("should get bridge transaction data (with fromAddress)", async () => {
        const txs = await lifi.buildTransaction(
            // Fake a quote that doesn't have rawResponse yet
            {
                inputAmount: ONE_USDC * 10n,
                outputAmount: 0n,
                fee: 0n,
                estimatedTimeMs: 0,
                protocolName: "Li.Fi"
            },
            {
                fromChain: ETHEREUM_CHAIN_ID,
                toChain: POLYGON_CHAIN_ID,
                token: "USDC",
                amount: ONE_USDC * 10n,
                fromAddress: VITALIK_ADDRESS,
            }
        );

        expect(txs).toBeDefined();
        expect(Array.isArray(txs)).toBe(true);
        expect(txs.length).toBeGreaterThan(0);

        const tx = txs[0];
        expect(tx.to).toBeDefined();
        expect(tx.to.startsWith("0x")).toBe(true);
        expect(tx.data).toBeDefined();
        expect(tx.data.startsWith("0x")).toBe(true);
        expect(tx.chainId).toBe(ETHEREUM_CHAIN_ID);
        expect(tx.gasLimit).toBeDefined();
    });

    test("should throw error if building transaction without fromAddress", async () => {
        try {
            await lifi.buildTransaction(
                {
                    inputAmount: ONE_USDC * 10n,
                    outputAmount: 0n,
                    fee: 0n,
                    estimatedTimeMs: 0,
                    protocolName: "Li.Fi"
                },
                {
                    fromChain: ETHEREUM_CHAIN_ID,
                    toChain: POLYGON_CHAIN_ID,
                    token: "USDC",
                    amount: ONE_USDC * 10n,
                    // Intentionally omitting fromAddress
                }
            );
            // Should not reach here
            expect(true).toBe(false);
        } catch (error: any) {
            expect(error.message).toContain("fromAddress is provided");
        }
    });
});
