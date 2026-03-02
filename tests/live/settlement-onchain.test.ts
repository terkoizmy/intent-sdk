/**
 * Phase E: Live Settlement On-Chain Integration Tests
 *
 * Tests the full settlement flow against a deployed `IntentSettlement.sol`
 * contract on **Unichain Sepolia** (chainId: 1301).
 *
 * All tests in this file are guarded by environment variable checks.
 * Tests that require a funded wallet are additionally marked with:
 *   test.skipIf(!HAS_PRIVATE_KEY)(...)
 *
 * Required Environment Variables:
 *   UNICHAIN_SEPOLIA_RPC_URL  — e.g. https://unichain-sepolia-rpc.publicnode.com
 *   SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA — deployed proxy address
 *
 * Optional (needed for write tests):
 *   SOLVER_PRIVATE_KEY        — funded testnet wallet private key
 *
 * How to run:
 *   UNICHAIN_SEPOLIA_RPC_URL=... SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA=0x... \
 *     bun test tests/live/settlement-onchain.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createPublicClient, http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ViemSettlementContract } from "@/solver/contracts/intent-settlement/viem-settlement-contract";
import { UNICHAIN_SEPOLIA_CONFIG } from "@/config/testnets";
import type { Address } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.UNICHAIN_SEPOLIA_RPC_URL;
const CONTRACT_ADDRESS = process.env.SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA;
const SOLVER_PRIVATE_KEY = process.env.SOLVER_PRIVATE_KEY;

const HAS_RPC = !!RPC_URL;
const HAS_CONTRACT = !!CONTRACT_ADDRESS;
const HAS_PRIVATE_KEY = !!SOLVER_PRIVATE_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// Viem Clients
// ─────────────────────────────────────────────────────────────────────────────

const UNICHAIN_SEPOLIA_VIEM_CHAIN = {
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL || ""] },
        public: { http: [RPC_URL || ""] },
    },
    blockExplorers: {
        default: { name: "Blockscout", url: "https://unichain-sepolia.blockscout.com" },
    },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase E: Settlement Contract — Unichain Sepolia", () => {
    let publicClient: ReturnType<typeof createPublicClient>;
    let walletClient: ReturnType<typeof createWalletClient>;
    let settlement: ViemSettlementContract;
    let solverAddress: Address;

    beforeAll(() => {
        if (!HAS_RPC || !HAS_CONTRACT) return;

        publicClient = createPublicClient({
            chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
            transport: http(RPC_URL!),
        });

        if (HAS_PRIVATE_KEY) {
            const account = privateKeyToAccount(`0x${SOLVER_PRIVATE_KEY!}` as `0x${string}`);
            solverAddress = account.address;
            walletClient = createWalletClient({
                chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
                transport: http(RPC_URL!),
                account,
            });
        }

        settlement = new ViemSettlementContract(
            CONTRACT_ADDRESS as Address,
            publicClient as any,
            walletClient as any,
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Connectivity - Read contract state (no wallet needed)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC || !HAS_CONTRACT)(
        "should connect to Unichain Sepolia and get the current block number",
        async () => {
            const blockNumber = await publicClient.getBlockNumber();
            expect(blockNumber).toBeGreaterThan(0n);
            console.log("[Unichain Sepolia] Current block number:", blockNumber.toString());
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Check if a known intent ID is settled (read-only)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC || !HAS_CONTRACT)(
        "should read isIntentSettled() for a dummy intent ID and return false",
        async () => {
            const FAKE_INTENT_ID = "0x0000000000000000000000000000000000000000000000000000000000000001";
            const settled = await settlement.isSettled(FAKE_INTENT_ID);
            expect(settled).toBe(false);
            console.log("[Settlement] isSettled(fake):", settled);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Simulate claim() without sending (dry-run)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC || !HAS_CONTRACT || !HAS_PRIVATE_KEY)(
        "should simulate claim() and expect an Invalid oracle signature revert",
        async () => {
            const { INTENT_SETTLEMENT_ABI } = await import("@/solver/contracts/intent-settlement/viem-settlement-contract");
            const DUMMY_ORDER = {
                settlementContract: CONTRACT_ADDRESS as Address,
                swapper: solverAddress,
                nonce: 1n,
                originChainId: 11155111,
                initiateDeadline: 0,
                fillDeadline: 0,
                orderData: "0x" as `0x${string}`
            };
            const DUMMY_SIG = `0x${"a".repeat(130)}` as `0x${string}`; // 65 bytes

            let simulationFailed = false;
            try {
                await publicClient.simulateContract({
                    address: CONTRACT_ADDRESS as Address,
                    abi: INTENT_SETTLEMENT_ABI,
                    functionName: "claim",
                    args: [DUMMY_ORDER, DUMMY_SIG],
                    account: solverAddress,
                });
            } catch (error: any) {
                simulationFailed = true;
                // The ABI encoding worked, but the contract reverted with invalid signature
                expect(error.message).toMatch(/Invalid oracle signature/i);
            }
            expect(simulationFailed).toBe(true);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Solver balance check (requires private key)
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC || !HAS_CONTRACT || !HAS_PRIVATE_KEY)(
        "should check solver ETH balance on Unichain Sepolia",
        async () => {
            const balance = await publicClient.getBalance({ address: solverAddress });
            expect(balance).toBeGreaterThan(0n); // Must have ETH for gas
            console.log("[Solver] ETH balance on Unichain Sepolia:", balance.toString());
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Full claim() — End-to-End Live Settlement
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC || !HAS_CONTRACT || !HAS_PRIVATE_KEY || !process.env.TESTING_USER_PRIVATE_KEY)(
        "should execute a real E2E settlement flow: open -> claim",
        async () => {
            const { LiveSettlementManager } = await import("@/solver/settlement/live-settlement-manager");
            const manager = new LiveSettlementManager(settlement);

            // 1. Setup Swapper Account
            const swapperAccount = privateKeyToAccount(`0x${process.env.TESTING_USER_PRIVATE_KEY!}` as `0x${string}`);
            const swapperWallet = createWalletClient({
                chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
                transport: http(RPC_URL!),
                account: swapperAccount,
            });

            // 1.5 Ensure swapper has ETH for gas
            const swapperBalance = await publicClient.getBalance({ address: swapperAccount.address });
            if (swapperBalance < 1000000000000000n) { // if less than 0.001 ETH
                console.log("[E2E] Swapper needs ETH, funding from solver...");
                const solverAccount = privateKeyToAccount(`0x${process.env.SOLVER_PRIVATE_KEY!}` as `0x${string}`);
                const fundHash = await walletClient.sendTransaction({
                    chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
                    account: solverAccount,
                    to: swapperAccount.address,
                    value: 5000000000000000n, // 0.005 ETH
                });
                await publicClient.waitForTransactionReceipt({ hash: fundHash });
            }

            const USDC_ADDRESS = "0x31d0220469e10c4E71834a79b1f276d740d3768F" as Address;
            const amountToLock = 1000000n; // 1 USDC (6 decimals)

            // 2. Swapper approves USDC to Settlement Contract (ignoring existing allowance for simplicity)
            const erc20Abi = [
                {
                    type: "function",
                    name: "approve",
                    stateMutability: "nonpayable",
                    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
                    outputs: [{ name: "", type: "bool" }]
                }
            ] as const;

            console.log("[E2E] Approving USDC...");
            const approveHash = await swapperWallet.writeContract({
                chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: "approve",
                args: [CONTRACT_ADDRESS as Address, amountToLock],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });

            // 3. Prepare CrossChainOrder
            const { encodeAbiParameters, keccak256 } = await import("viem");
            const { hashTypedData, toBytes } = await import("viem");
            const { signMessage } = await import("viem/accounts");

            const orderData = encodeAbiParameters(
                [
                    { type: "address", name: "token" },
                    { type: "uint256", name: "amount" },
                ],
                [USDC_ADDRESS, amountToLock]
            );

            // Random nonce to ensure unique intentId
            const nonce = BigInt(Math.floor(Math.random() * 1000000));

            const order = {
                settlementContract: CONTRACT_ADDRESS as Address,
                swapper: swapperAccount.address,
                nonce: nonce,
                originChainId: 1301, // same chain for test simplicity
                initiateDeadline: Math.floor(Date.now() / 1000) + 3600,
                fillDeadline: Math.floor(Date.now() / 1000) + 3600,
                orderData: orderData
            };

            // 4. Swapper signs the order (EIP-712)
            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: 1301,
                verifyingContract: CONTRACT_ADDRESS as Address,
            } as const;

            const types = {
                CrossChainOrder: [
                    { name: 'settlementContract', type: 'address' },
                    { name: 'swapper', type: 'address' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'originChainId', type: 'uint32' },
                    { name: 'initiateDeadline', type: 'uint32' },
                    { name: 'fillDeadline', type: 'uint32' },
                    { name: 'orderData', type: 'bytes' },
                ]
            } as const;

            const swapperSignature = await swapperWallet.signTypedData({
                domain,
                types,
                primaryType: "CrossChainOrder",
                message: order
            });

            // 5. Swapper calls open()
            console.log("[E2E] Swapper opening intent...");
            const { INTENT_SETTLEMENT_ABI } = await import("@/solver/contracts/intent-settlement/viem-settlement-contract");
            const openHash = await swapperWallet.writeContract({
                chain: UNICHAIN_SEPOLIA_VIEM_CHAIN as any,
                address: CONTRACT_ADDRESS as Address,
                abi: INTENT_SETTLEMENT_ABI,
                functionName: "open",
                args: [order, swapperSignature, orderData],
            });
            await publicClient.waitForTransactionReceipt({ hash: openHash });

            // 6. Solver generates Oracle Signature
            const encodedOrder = encodeAbiParameters(
                [
                    {
                        type: "tuple",
                        components: [
                            { name: "settlementContract", type: "address" },
                            { name: "swapper", type: "address" },
                            { name: "nonce", type: "uint256" },
                            { name: "originChainId", type: "uint32" },
                            { name: "initiateDeadline", type: "uint32" },
                            { name: "fillDeadline", type: "uint32" },
                            { name: "orderData", type: "bytes" },
                        ]
                    }
                ],
                [order]
            );
            const intentId = keccak256(encodedOrder);

            // Oracle signature digest: tightly packed hash(intentId, "FILLED", solver.address) per IntentSettlement.sol abi.encodePacked
            const { encodePacked } = await import("viem");
            const oracleDigestPayload = encodePacked(
                ["bytes32", "string", "address"],
                [intentId, "FILLED", solverAddress]
            );
            const oracleDigest = keccak256(oracleDigestPayload);

            // Sign the personal message using the deployer/oracle key (solver is the oracle in our MVP)
            const solverAccount = privateKeyToAccount(`0x${process.env.SOLVER_PRIVATE_KEY!}` as `0x${string}`);
            const oracleSignature = await solverAccount.signMessage({
                message: { raw: toBytes(oracleDigest) }
            });

            // 7. Solver calls claim() via LiveSettlementManager
            console.log("[E2E] Solver claiming intent...");
            const result = await manager.settleOnChain({
                intentId: intentId, // Not technically used in claim encoding but good for trace
                swapper: order.swapper,
                token: USDC_ADDRESS,
                amount: amountToLock,
                recipient: solverAddress,
                nonce: order.nonce,
                originChainId: order.originChainId,
                initiateDeadline: order.initiateDeadline,
                fillDeadline: order.fillDeadline,
            }, oracleSignature);

            expect(result.fillTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(result.blockNumber).toBeGreaterThan(0n);
            console.log("[Settlement] E2E claim() tx hash:", result.fillTxHash);

            // 8. Verify it is settled
            const isSettled = await manager.isSettled(intentId);
            expect(isSettled).toBe(true);
        },
        // Timeout 60s because we have 3 on-chain transactions to wait for
        { timeout: 60000 }
    );
});
