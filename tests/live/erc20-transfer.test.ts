/**
 * Phase C: Live ERC-20 Transfer Execution Tests
 *
 * NOTE: These tests spend REAL TESTNET GAS and move REAL TESTNET USDC.
 * To avoid losing funds, the tests perform "self-transfers" (sending funds
 * from the solver wallet to its own address).
 *
 * Required Env Vars:
 * - SOLVER_PRIVATE_KEY
 * - UNICHAIN_SEPOLIA_RPC_URL
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { WalletManager } from "@/shared/wallet-manager/wallet-manager";
import { RPCProviderManager } from "@/shared/rpc/provider-manager";
import { TokenRegistry, TESTNET_TOKENS } from "@/shared/token-registry/registry";
import { ChainRegistry } from "@/shared/chain-registry/registry";
import { createViemSignerFactory } from "@/shared/wallet-manager/viem-signer";
import { createViemProviderFactory } from "@/shared/rpc/viem-provider";
import { UNICHAIN_SEPOLIA_CONFIG } from "@/config/testnets";
import { encodeBalanceOfData, encodeTransferData } from "@/shared/utils/erc20-utils";

// Extract env vars
const RAW_PRIVATE_KEY = process.env.SOLVER_PRIVATE_KEY;
const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL;
const HAS_LIVE_ENV = !!RAW_PRIVATE_KEY && !!UNICHAIN_RPC;

// Validate/normalize private key
const PRIVATE_KEY = RAW_PRIVATE_KEY?.startsWith("0x")
    ? RAW_PRIVATE_KEY
    : `0x${RAW_PRIVATE_KEY}`;

describe("Phase C: Live ERC-20 Transfers", () => {
    let walletManager: WalletManager;
    let providerManager: RPCProviderManager;
    let tokenRegistry: TokenRegistry;
    let chainRegistry: ChainRegistry;

    let USDC_ADDRESS: string;

    beforeAll(() => {
        if (!HAS_LIVE_ENV) return;

        // 1. Setup Wallet Manager with RPC mapping for live tx
        const rpcMapper = (chainId: number) => chainId === 1301 ? UNICHAIN_RPC : undefined;
        walletManager = new WalletManager(PRIVATE_KEY, createViemSignerFactory(rpcMapper));

        // 2. Setup Provider Manager
        providerManager = new RPCProviderManager(createViemProviderFactory());
        const configWithRpc = { ...UNICHAIN_SEPOLIA_CONFIG, rpcUrl: UNICHAIN_RPC! };
        providerManager.registerChain(configWithRpc);

        // 3. Setup Registries
        tokenRegistry = new TokenRegistry();
        tokenRegistry.registerAll(TESTNET_TOKENS);

        chainRegistry = new ChainRegistry();
        chainRegistry.register(configWithRpc);

        USDC_ADDRESS = tokenRegistry.get("USDC", 1301)!.address;
    });

    test.skipIf(!HAS_LIVE_ENV)("should compile encodeBalanceOfData and encodeTransferData correctly", () => {
        const dummyAddress = "0x1234567890123456789012345678901234567890";
        const balanceData = encodeBalanceOfData(dummyAddress);
        expect(balanceData).toBe(`0x70a082310000000000000000000000001234567890123456789012345678901234567890`);

        const transferData = encodeTransferData(dummyAddress, 1n); // 1 wei
        expect(transferData).toBe(`0xa9059cbb00000000000000000000000012345678901234567890123456789012345678900000000000000000000000000000000000000000000000000000000000000001`);
    });

    test.skipIf(!HAS_LIVE_ENV)("should read live USDC balance on Unichain Sepolia", async () => {
        const agentAddress = walletManager.getAddress();

        const balance = await providerManager.getTokenBalance(
            1301,
            USDC_ADDRESS as `0x${string}`,
            agentAddress
        );

        // User mentioned having ~20 USDC, which is 20_000_000 units (6 decimals)
        expect(balance).toBeGreaterThan(0n);
        console.log(`\n[Live RPC] Evaluated USDC Balance for ${agentAddress}: ${Number(balance) / 1e6} USDC`);
    });

    test.skipIf(!HAS_LIVE_ENV)("should execute a live ERC-20 self-transfer on Unichain Sepolia via WalletManager", async () => {
        const agentAddress = walletManager.getAddress();

        // Transfer 0.01 USDC to self
        const transferAmount = 10000n; // 0.01 USDC (6 decimals = 10_000 units)
        const transferData = encodeTransferData(agentAddress, transferAmount);

        try {
            console.log(`\n[Live TX] Broadcasting transfer of 0.01 USDC toself on Unichain...`);
            const txHash = await walletManager.sendTransaction(1301, {
                to: USDC_ADDRESS as `0x${string}`,
                data: transferData,
                value: 0n,
            });

            console.log(`[Live TX] Success! TxHash: ${txHash}`);
            expect(txHash.startsWith("0x")).toBe(true);

            // Fetch provider and wait for receipt
            const provider = providerManager.getProvider(1301);

            // Simple polling for receipt (max 5 tries, 1s delay)
            let receipt = null;
            for (let i = 0; i < 5; i++) {
                // bun test doesn't natively wait like jest unless we manually promise it
                await new Promise(resolve => setTimeout(resolve, 1000));
                receipt = await provider.getTransactionReceipt(txHash);
                if (receipt) break;
            }

            if (receipt) {
                console.log(`[Live TX] Confirmed in block ${receipt.blockNumber}`);

                // Explicitly verify that the ERC-20 call succeeded:
                // IRPCProvider.getTransactionReceipt returns status as a number:
                // 1 = success, 0 = reverted
                if (receipt.status !== 1) {
                    throw new Error(
                        `Transaction was included in block ${receipt.blockNumber} but REVERTED (status=${receipt.status}). ` +
                        `Check that USDC address and calldata are correct.`
                    );
                }

                console.log(`[Live TX] ✅ Transfer confirmed as SUCCESS`);
            } else {
                console.log(`[Live TX] Sent successfully but receipt polling timed out. Hash: ${txHash}`);
            }
        } catch (error) {
            console.error("Self transfer failed:", error);
            throw error;
        }
    }, 15000); // 15 second timeout for live tx
});
