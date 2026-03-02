/**
 * Phase F: End-to-End Testnet Health Check Tests
 *
 * Validates that all configured RPC endpoints are reachable and
 * returning valid data before running heavier E2E tests.
 *
 * This test file is intentionally lightweight — no wallets, no gas.
 *
 * Required Environment Variables:
 *   UNICHAIN_SEPOLIA_RPC_URL      — RPC for Unichain Sepolia (chainId: 1301)
 *
 * Optional:
 *   BASE_SEPOLIA_RPC_URL           — RPC for Base Sepolia (chainId: 84532)
 *   SEPOLIA_RPC_URL               — RPC for Ethereum Sepolia (chainId: 11155111)
 *   ETH_RPC_URL                   — Ethereum mainnet RPC (for Aave health check)
 *
 * How to run:
 *   UNICHAIN_SEPOLIA_RPC_URL=... bun test tests/e2e/testnet-health.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createPublicClient, http } from "viem";
import { RPCProviderManager } from "@/shared/rpc/provider-manager";
import { createViemProviderFactory } from "@/shared/rpc/viem-provider";
import { ViemSettlementContract } from "@/solver/contracts/intent-settlement/viem-settlement-contract";
import type { Address } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL;
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL;
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const ETH_RPC = process.env.ETH_RPC_URL;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a minimal viem public client for a given RPC URL and chainId. */
function makeClient(rpcUrl: string, chainId: number) {
    return createPublicClient({
        chain: {
            id: chainId,
            name: `Chain-${chainId}`,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
        } as any,
        transport: http(rpcUrl),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase F: Testnet Health Checks", () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Unichain Sepolia — block number
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!UNICHAIN_RPC)(
        "[Health] Unichain Sepolia RPC returns a valid block number",
        async () => {
            const client = makeClient(UNICHAIN_RPC!, 1301);
            const block = await client.getBlockNumber();
            expect(block).toBeGreaterThan(0n);
            console.log(`[Health] Unichain Sepolia block: ${block}`);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Base Sepolia — block number
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!BASE_SEPOLIA_RPC)(
        "[Health] Base Sepolia RPC returns a valid block number",
        async () => {
            const client = makeClient(BASE_SEPOLIA_RPC!, 84532);
            const block = await client.getBlockNumber();
            expect(block).toBeGreaterThan(0n);
            console.log(`[Health] Base Sepolia block: ${block}`);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Ethereum Sepolia — block number
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!SEPOLIA_RPC)(
        "[Health] Ethereum Sepolia RPC returns a valid block number",
        async () => {
            const client = makeClient(SEPOLIA_RPC!, 11155111);
            const block = await client.getBlockNumber();
            expect(block).toBeGreaterThan(0n);
            console.log(`[Health] Ethereum Sepolia block: ${block}`);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Ethereum Mainnet — block number (for Aave)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!ETH_RPC)(
        "[Health] Ethereum Mainnet RPC returns a valid block number",
        async () => {
            const client = makeClient(ETH_RPC!, 1);
            const block = await client.getBlockNumber();
            expect(block).toBeGreaterThan(0n);
            console.log(`[Health] Ethereum Mainnet block: ${block}`);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Li.Fi API — public endpoint reachability
    // ─────────────────────────────────────────────────────────────────────────

    test(
        "[Health] Li.Fi public API /chains returns a valid response",
        async () => {
            const res = await fetch("https://li.quest/v1/chains");
            expect(res.ok || res.status === 429).toBe(true); // 429 is rate-limited but reachable
            if (res.ok) {
                const data = await res.json();
                expect(Array.isArray(data.chains)).toBe(true);
                expect(data.chains.length).toBeGreaterThan(0);
                console.log(`[Health] Li.Fi chains available: ${data.chains.length}`);
            }
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: RPCProviderManager — registers and retrieves providers correctly
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!UNICHAIN_RPC)(
        "[Health] RPCProviderManager can register and retrieve Unichain Sepolia provider",
        async () => {
            const manager = new RPCProviderManager(createViemProviderFactory());
            manager.registerChain({
                id: 1301,
                name: "Unichain Sepolia",
                rpcUrl: UNICHAIN_RPC!,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                explorer: "https://unichain-sepolia.blockscout.com",
                fallbackRpcUrls: []
            });
            const provider = manager.getProvider(1301);
            const block = await provider.getBlockNumber();
            expect(block).toBeGreaterThan(0n);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Settlement contract — isSettled read (no wallet needed)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!UNICHAIN_RPC || !process.env.SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA)(
        "[Health] Settlement contract responds to isSettled() read call",
        async () => {
            const FAKE_INTENT_ID = "0x" + "0".repeat(64);
            const publicClient = makeClient(UNICHAIN_RPC!, 1301);
            const settlement = new ViemSettlementContract(process.env.SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA as Address, publicClient as any, undefined as any);
            const settled = await settlement.isSettled(FAKE_INTENT_ID);
            expect(settled).toBe(false);
        }
    );
});
