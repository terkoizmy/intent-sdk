/**
 * IntentSettlement Viem Contract Wrapper
 *
 * Phase E: Contract Deployment & Live Settlement
 *
 * A viem-native interface to the deployed `IntentSettlement.sol` contract.
 * Replaces the old ethers.js-based `IntentSettlementContract` for live
 * on-chain settlement calls.
 *
 * Unlike the ethers wrapper, this implementation:
 * - Uses `viem`'s `getContract` + `walletClient` for signing and broadcasting
 * - Parses `IntentFilled` events directly from transaction receipts
 * - Returns tx hash as a plain string for easy tracking
 *
 * Stage 3 — Phase E
 */

import type { Address, Hash } from "../../../types/common";
import type { PublicClient, WalletClient } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
// ABI
// ─────────────────────────────────────────────────────────────────────────────

export const INTENT_SETTLEMENT_ABI = [
    // open() - called by swapper to lock funds intent
    {
        type: "function",
        name: "open",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "order",
                type: "tuple",
                components: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" },
                ],
            },
            { name: "signature", type: "bytes" },
            { name: "orderData", type: "bytes" },
        ],
        outputs: [],
    },
    // claim() - alternative to fill(), called by solver after target-chain proof
    {
        type: "function",
        name: "claim",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "order",
                type: "tuple",
                components: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" },
                ],
            },
            { name: "signature", type: "bytes" },
        ],
        outputs: [],
    },
    // refund() - returns locked funds to swapper after fillDeadline expires
    {
        type: "function",
        name: "refund",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "order",
                type: "tuple",
                components: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" },
                ],
            },
        ],
        outputs: [],
    },
    // isIntentSettled()
    {
        type: "function",
        name: "isIntentSettled",
        stateMutability: "view",
        inputs: [{ name: "intentId", type: "bytes32" }],
        outputs: [{ name: "", type: "bool" }],
    },
    // Events
    {
        type: "event",
        name: "FundsLocked",
        inputs: [
            { name: "intentId", type: "bytes32", indexed: true },
            { name: "swapper", type: "address", indexed: true },
            { name: "token", type: "address", indexed: false },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "FundsClaimed",
        inputs: [
            { name: "intentId", type: "bytes32", indexed: true },
            { name: "solver", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "IntentFilled",
        inputs: [
            { name: "orderId", type: "bytes32", indexed: true },
            { name: "filler", type: "address", indexed: true },
            { name: "originData", type: "bytes", indexed: false },
            { name: "fillerData", type: "bytes", indexed: false },
        ],
    },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossChainOrderViem {
    settlementContract: Address;
    swapper: Address;
    nonce: bigint;
    originChainId: number;
    initiateDeadline: number;
    fillDeadline: number;
    orderData: `0x${string}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ViemSettlementContract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Viem-native wrapper around the deployed `IntentSettlement.sol`.
 *
 * Usage:
 *   const settlement = new ViemSettlementContract(contractAddress, publicClient, walletClient);
 *   const result = await settlement.claim(order, solverSignature);
 *   console.log("Settled intent in tx:", result.txHash);
 */
export class ViemSettlementContract {
    constructor(
        private readonly address: Address,
        private readonly publicClient: PublicClient,
        private readonly walletClient: WalletClient,
    ) { }

    /**
     * Check if a specific intent ID has already been settled on this contract.
     */
    async isSettled(intentId: `0x${string}`): Promise<boolean> {
        return await this.publicClient.readContract({
            address: this.address,
            abi: INTENT_SETTLEMENT_ABI,
            functionName: "isIntentSettled",
            args: [intentId],
        });
    }

    /**
     * Call `claim()` using a solver signature as proof.
     * Alternative to fill() for the claim-based settlement flow.
     */
    async claim(
        order: CrossChainOrderViem,
        solverSignature: `0x${string}`,
    ): Promise<{ txHash: Hash, blockNumber: bigint }> {
        console.log("claim log 1")
        if (!this.walletClient.account) {
            throw new Error("WalletClient has no account attached");
        }

        // Step 1: Simulate the tx first to catch reverts early
        try {
            await this.publicClient.simulateContract({
                address: this.address,
                abi: INTENT_SETTLEMENT_ABI,
                functionName: "claim",
                args: [order, solverSignature],
                account: this.walletClient.account,
            });
        } catch (error: any) {
            console.error(`[Settlement] Simulation failed for claim():`);
            const fs = require('fs');
            fs.writeFileSync('debug.json', JSON.stringify(error, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
            throw new Error(`Simulation failed: ${error.message}`);
        }

        const txHash = await this.walletClient.writeContract({
            chain: this.walletClient.chain,
            address: this.address,
            abi: INTENT_SETTLEMENT_ABI,
            functionName: "claim",
            args: [order, solverSignature],
            account: this.walletClient.account,
        });

        console.log(`[Settlement] Broadcasted claim() tx: ${txHash}`);

        const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status !== "success") {
            throw new Error(`Claim transaction reverted: ${txHash}`);
        }

        return { txHash, blockNumber: receipt.blockNumber };
    }

    getAddress(): Address {
        return this.address;
    }
}
