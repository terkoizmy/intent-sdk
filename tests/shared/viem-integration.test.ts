/**
 * viem Integration Tests
 *
 * Tests for:
 * - ViemProvider (IRPCProvider implementation via viem)
 * - ViemSigner (WalletSigner implementation via viem)
 * - createViemProviderFactory / createViemSignerFactory
 *
 * Stage 3 — Live Integration (Phase B)
 *
 * NOTE: Live RPC tests require SEPOLIA_RPC_URL to be set in .env.
 *       They are automatically skipped if the env var is not present.
 */

import { describe, test, expect } from "bun:test";
import { ViemProvider, createViemProviderFactory } from "@/shared/rpc/viem-provider";
import { ViemSigner, createViemSignerFactory } from "@/shared/wallet-manager/viem-signer";
import { RPCProviderManager } from "@/shared/rpc/provider-manager";
import { WalletManager } from "@/shared/wallet-manager/wallet-manager";
import { SEPOLIA_CONFIG } from "@/config/testnets";

// ── Test config ─────────────────────────────────────────────
// Use a well-known test private key (DO NOT use in production!)
// This is Hardhat's default account #0:
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // derived from above

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL;
const HAS_RPC = !!SEPOLIA_RPC;

// ─────────────────────────────────────────────────────────────
// ViemSigner — Offline tests (no RPC needed)
// ─────────────────────────────────────────────────────────────
describe("ViemSigner", () => {
    test("should derive correct address from private key", () => {
        const signer = new ViemSigner(TEST_PRIVATE_KEY, 1);
        expect(signer.getAddress().toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    });

    test("should sign a message and return hex signature", async () => {
        const signer = new ViemSigner(TEST_PRIVATE_KEY, 1);
        const signature = await signer.signMessage("hello");
        expect(signature.startsWith("0x")).toBe(true);
        expect(signature.length).toBeGreaterThan(10);
    });

    test("should throw for invalid private key", () => {
        expect(() => {
            new ViemSigner("0xinvalid" as `0x${string}`, 1);
        }).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────
// ViemSigner — Factory pattern
// ─────────────────────────────────────────────────────────────
describe("createViemSignerFactory", () => {
    test("should integrate with WalletManager", () => {
        const factory = createViemSignerFactory();
        const wallet = new WalletManager(TEST_PRIVATE_KEY, factory);
        expect(wallet.getAddress().toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    });

    test("should produce signers that sign messages", async () => {
        const factory = createViemSignerFactory();
        const wallet = new WalletManager(TEST_PRIVATE_KEY, factory);
        const sig = await wallet.signMessage("test");
        expect(sig.startsWith("0x")).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────
// ViemProvider — Live RPC tests (auto-skipped if no SEPOLIA_RPC_URL)
// ─────────────────────────────────────────────────────────────
describe("ViemProvider (live RPC)", () => {
    test.skipIf(!HAS_RPC)("should connect and get block number", async () => {
        const config = { ...SEPOLIA_CONFIG, rpcUrl: SEPOLIA_RPC! };
        const provider = new ViemProvider(config);
        const blockNumber = await provider.getBlockNumber();
        expect(blockNumber).toBeGreaterThan(0);
    });

    test.skipIf(!HAS_RPC)("should get gas price", async () => {
        const config = { ...SEPOLIA_CONFIG, rpcUrl: SEPOLIA_RPC! };
        const provider = new ViemProvider(config);
        const gasPrice = await provider.getGasPrice();
        expect(BigInt(gasPrice)).toBeGreaterThan(0n);
    });

    test.skipIf(!HAS_RPC)("should report healthy", async () => {
        const config = { ...SEPOLIA_CONFIG, rpcUrl: SEPOLIA_RPC! };
        const provider = new ViemProvider(config);
        const healthy = await provider.isHealthy();
        expect(healthy).toBe(true);
    });

    test.skipIf(!HAS_RPC)("should return null for non-existent tx receipt", async () => {
        const config = { ...SEPOLIA_CONFIG, rpcUrl: SEPOLIA_RPC! };
        const provider = new ViemProvider(config);
        // Dummy transaction hash — viem throws if not found, we catch → null
        const receipt = await provider.getTransactionReceipt("0x" + "00".repeat(32));
        expect(receipt).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────
// createViemProviderFactory — with RPCProviderManager
// ─────────────────────────────────────────────────────────────
describe("createViemProviderFactory", () => {
    test.skipIf(!HAS_RPC)("should integrate with RPCProviderManager (live RPC)", async () => {
        const rpm = new RPCProviderManager(createViemProviderFactory());
        rpm.registerChain({ ...SEPOLIA_CONFIG, rpcUrl: SEPOLIA_RPC! });
        const provider = rpm.getProvider(11155111);
        expect(await provider.isHealthy()).toBe(true);
    });
});
