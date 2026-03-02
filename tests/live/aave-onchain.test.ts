/**
 * Phase D: Aave On-Chain Integration Tests
 *
 * These tests call the REAL Aave V3 Pool Data Provider contract on-chain.
 * They only READ data (no gas spent, no funds moved).
 *
 * Required Env Vars:
 * - ETH_RPC_URL  → Ethereum mainnet RPC (e.g. Alchemy or Infura)
 *
 * How to run:
 *   ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY bun test tests/live/aave-onchain.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { AaveProtocol } from "@/solver/protocols/lending/aave";
import { RPCProviderManager } from "@/shared/rpc/provider-manager";
import { createViemProviderFactory } from "@/shared/rpc/viem-provider";
import type { Address } from "@/types/common";

// ---------------------------------------------------------------------------
// Guard: skip all tests if no RPC URL is provided
// ---------------------------------------------------------------------------

const ETH_RPC_URL = process.env.ETH_RPC_URL;
const HAS_RPC = !!ETH_RPC_URL;

// ---------------------------------------------------------------------------
// Constants (Ethereum Mainnet)
// ---------------------------------------------------------------------------

const ETH_CHAIN_ID = 1;

// Aave V3 Pool contract on Ethereum mainnet
const AAVE_POOL_ADDRESS_ETH = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as Address;

// USDC contract address on Ethereum mainnet
const USDC_ADDRESS_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Phase D: Aave On-Chain APY Integration", () => {
    let aave: AaveProtocol;
    let providerManager: RPCProviderManager;

    beforeAll(() => {
        if (!HAS_RPC) return;

        // 1. Create a ViemProvider factory:
        providerManager = new RPCProviderManager(createViemProviderFactory());

        // 2. Register Ethereum mainnet chain config
        const ETH_MAINNET_CONFIG = {
            id: ETH_CHAIN_ID,
            name: "Ethereum",
            rpcUrl: ETH_RPC_URL!,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            explorer: "https://etherscan.io",
            fallbackRpcUrls: []
        };
        providerManager.registerChain(ETH_MAINNET_CONFIG);

        // 3. Instantiate AaveProtocol
        // Mainnet Aave V3 Pool Data Provider
        const AAVE_DATA_PROVIDER_ETH = "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3" as Address;

        aave = new AaveProtocol(
            providerManager,
            { [ETH_CHAIN_ID]: AAVE_POOL_ADDRESS_ETH },
            { [ETH_CHAIN_ID]: AAVE_DATA_PROVIDER_ETH }
        );
    });

    // -------------------------------------------------------------------------
    // Test 1: getAPY() — USDC on Ethereum mainnet
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_RPC)("should return a real USDC APY > 0 from Aave V3 on Ethereum mainnet", async () => {
        const apy = await aave.getAPY(USDC_ADDRESS_ETH, ETH_CHAIN_ID);
        expect(typeof apy).toBe("number");
        expect(apy).toBeGreaterThan(0);
        expect(apy).toBeLessThan(100); // Sanity: APY won't exceed 100% for stablecoins
        console.log(`[Aave] USDC APY on Ethereum mainnet: ${apy.toFixed(4)}%`);
    });

    // -------------------------------------------------------------------------
    // Test 2: getAPY() — DAI on Ethereum mainnet (sanity check different token)
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_RPC)("should return a real DAI APY from Aave V3 on Ethereum mainnet", async () => {
        // DAI contract address on Ethereum mainnet
        const DAI_ADDRESS_ETH = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

        const apy = await aave.getAPY(DAI_ADDRESS_ETH, ETH_CHAIN_ID);
        expect(typeof apy).toBe("number");
        expect(apy).toBeGreaterThanOrEqual(0); // DAI APY can be 0 if no liquidity
        expect(apy).toBeLessThan(100);
        console.log(`[Aave] DAI APY on Ethereum mainnet: ${apy.toFixed(4)}%`);
    });

    // -------------------------------------------------------------------------
    // Test 3: Verify raw liquidityRate decoding
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_RPC)("should correctly decode liquidityRate from getReserveData raw calldata", async () => {
        const provider = providerManager.getProvider(ETH_CHAIN_ID);
        const calldata = "0x35ea6a75" + USDC_ADDRESS_ETH.toLowerCase().replace("0x", "").padStart(64, "0");
        const AAVE_DATA_PROVIDER = "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3" as Address;

        const result = await provider.call(AAVE_DATA_PROVIDER, calldata);

        const { decodeFunctionResult } = await import("viem");
        const AAVE_DATA_PROVIDER_ABI = [{
            "inputs": [{ "internalType": "address", "name": "asset", "type": "address" }],
            "name": "getReserveData",
            "outputs": [
                { "internalType": "uint256", "name": "unbacked", "type": "uint256" },
                { "internalType": "uint256", "name": "accruedToTreasuryScaled", "type": "uint256" },
                { "internalType": "uint256", "name": "totalAToken", "type": "uint256" },
                { "internalType": "uint256", "name": "totalStableDebt", "type": "uint256" },
                { "internalType": "uint256", "name": "totalVariableDebt", "type": "uint256" },
                { "internalType": "uint256", "name": "liquidityRate", "type": "uint256" },
                { "internalType": "uint256", "name": "variableBorrowRate", "type": "uint256" },
                { "internalType": "uint256", "name": "stableBorrowRate", "type": "uint256" },
                { "internalType": "uint256", "name": "averageStableBorrowRate", "type": "uint256" },
                { "internalType": "uint256", "name": "liquidityIndex", "type": "uint256" },
                { "internalType": "uint256", "name": "variableBorrowIndex", "type": "uint256" },
                { "internalType": "uint40", "name": "lastUpdateTimestamp", "type": "uint40" }
            ],
            "stateMutability": "view",
            "type": "function"
        }] as const;

        const decoded = decodeFunctionResult({
            abi: AAVE_DATA_PROVIDER_ABI,
            functionName: "getReserveData",
            data: result as `0x${string}`,
        });

        const liquidityRate = BigInt(decoded[5]);

        expect(liquidityRate).toBeGreaterThan(0n);
        console.log("[Aave] Raw liquidityRate (ray):", liquidityRate.toString());

        const RAY = 1e27;
        const SECONDS_PER_YEAR = 31536000;
        const ratePerSecond = Number(liquidityRate) / RAY;
        const apy = (Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1) * 100;
        expect(apy).toBeGreaterThan(0);
        console.log("[Aave] Decoded APY:", apy.toFixed(4) + "%");
    });

    // -------------------------------------------------------------------------
    // Test 4: Error handling — Unsupported chain
    // -------------------------------------------------------------------------

    test("should throw when called for an unsupported chain", async () => {
        // This test does NOT need ETH_RPC_URL — it verifies the guard logic.
        const mockRpcManager = {} as RPCProviderManager;
        const localAave = new AaveProtocol(
            mockRpcManager,
            { [ETH_CHAIN_ID]: AAVE_POOL_ADDRESS_ETH },
            { [ETH_CHAIN_ID]: "0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3" as Address }
        );

        await expect(localAave.getAPY(USDC_ADDRESS_ETH, 999)).rejects.toThrow(
            "Aave not supported/configured for chain 999"
        );
    });

    // -------------------------------------------------------------------------
    // Test 5: Error handling — Invalid token / no reserve
    // -------------------------------------------------------------------------

    test.skipIf(!HAS_RPC)("should throw or return 0 when token has no Aave reserve", async () => {
        // Use a dummy address that definitely has no Aave reserve:
        const FAKE_TOKEN = "0x0000000000000000000000000000000000000001";
        const apy = await aave.getAPY(FAKE_TOKEN, ETH_CHAIN_ID);
        // By looking at the `getAPY` implementation, if the token is not found on Aave,
        // it returns a giant tuple of zeros, so liquidityRateRay will be 0.
        expect(apy).toBe(0);
    });
});
