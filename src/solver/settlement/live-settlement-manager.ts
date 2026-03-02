/**
 * Viem-based Live Settlement Manager
 *
 * Phase E: Contract Deployment & Live Settlement
 *
 * This manager replaces the ethers.js-based SettlementManager for
 * live, on-chain settlement flows. It uses the ViemSettlementContract
 * to call claim() on the deployed IntentSettlement.sol.
 *
 * The lifecycle is:
 *   1. Solver sends tokens on target chain → gets txHash (Phase C)
 *   2. Call settleOnChain() → builds & broadcasts claim() tx on source chain
 *   3. Parse IntentFilled event from receipt
 *   4. Return settlement record
 *
 * Stage 3 — Phase E
 */

import type { Address, Hash } from "../../types/common";
import { ViemSettlementContract } from "../contracts/intent-settlement/viem-settlement-contract";
import { encodeAbiParameters, keccak256 } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveSettlementParams {
    /** Unique identifier for this intent */
    intentId: string;
    /** Address of the user who initiated the order */
    swapper: Address;
    /** Token address on the source chain */
    token: Address;
    /** Amount in token's smallest unit */
    amount: bigint;
    /** Recipient on target chain */
    recipient: Address;
    /** Nonce used in the original order */
    nonce: bigint;
    /** Origin chain (source chain where funds are locked) */
    originChainId: number;
    /** Deadline for order initiation */
    initiateDeadline: number;
    /** Deadline for order fill */
    fillDeadline: number;
}

export interface LiveSettlementResult {
    intentId: string;
    fillTxHash: Hash;
    blockNumber: bigint;
    settledAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveSettlementManager
// ─────────────────────────────────────────────────────────────────────────────

export class LiveSettlementManager {
    constructor(
        private readonly settlementContract: ViemSettlementContract,
    ) { }

    /**
     * Settle an intent on-chain by calling claim() on the IntentSettlement contract.
     *
     * @param params - The settlement parameters derived from the original intent
     * @param signature - The solver or oracle signature verifying the cross-chain execution
     * @returns LiveSettlementResult including the claim tx hash
     */
    async settleOnChain(params: LiveSettlementParams, signature: `0x${string}`): Promise<LiveSettlementResult> {
        // Step 1: Build the orderData = abi.encode(token, amount) based on IntentSettlement.sol
        // Wait, looking at IntentSettlement.sol, orderData is just (address inputToken, uint256 inputAmount)
        const orderData = encodeAbiParameters(
            [
                { type: "address", name: "token" },
                { type: "uint256", name: "amount" },
            ],
            [params.token as `0x${string}`, params.amount]
        );

        const settlementAddress = this.settlementContract.getAddress() as `0x${string}`;

        // Step 2: Build the CrossChainOrder struct
        const order = {
            settlementContract: settlementAddress,
            swapper: params.swapper as `0x${string}`,
            nonce: params.nonce,
            originChainId: params.originChainId,
            initiateDeadline: params.initiateDeadline,
            fillDeadline: params.fillDeadline,
            orderData: orderData
        };

        // Step 3: Call claim()
        const result = await this.settlementContract.claim(order, signature);

        return {
            intentId: params.intentId,
            fillTxHash: result.txHash,
            blockNumber: result.blockNumber,
            settledAt: Math.floor(Date.now() / 1000),
        };
    }

    /**
     * Check if an intent has already been settled on the contract.
     */
    async isSettled(intentId: `0x${string}`): Promise<boolean> {
        return await this.settlementContract.isSettled(intentId);
    }
}
