/**
 * Execution Types
 *
 * Types untuk transaction building dan multi-chain execution.
 */

import type { Address, ChainId, Hash } from "../../types/common";

/**
 * Raw transaction data
 *
 * Representasi transaksi yang siap kirim ke chain.
 * Compatible dengan ethers.js transaction format.
 */
export interface Transaction {
    /** Target contract address */
    to: Address;

    /** Encoded function call data */
    data: string;

    /** ETH value to send (in wei, usually "0" for ERC20 ops) */
    value: string;

    /** Gas limit */
    gasLimit: string;

    /** Chain ID where tx will be executed */
    chainId: ChainId;

    /** Transaction nonce (managed by executor) */
    nonce?: number;

    /** Max fee per gas (EIP-1559) */
    maxFeePerGas?: string;

    /** Max priority fee per gas (EIP-1559) */
    maxPriorityFeePerGas?: string;
}

/**
 * Execution result (single transaction)
 */
export interface ExecutionResult {
    /** Whether the transaction succeeded */
    success: boolean;

    /** Transaction hash */
    txHash?: Hash;

    /** Gas used by the transaction */
    gasUsed?: string;

    /** Block number where tx was included */
    blockNumber?: number;

    /** Error message if failed */
    error?: string;
}

/**
 * Multi-chain execution status
 */
export type ExecutionStatus =
    | "pending"       // Not started
    | "source_sent"   // Source chain tx sent
    | "target_sent"   // Target chain tx sent
    | "completed"     // Both chains done
    | "failed";       // One or both failed

/**
 * Multi-Chain Execution
 *
 * Tracks paired execution across source and target chains.
 * Used by solve() flow:
 * 1. Send on target chain (fulfill user)
 * 2. Claim on source chain (get solver's payment)
 */
export interface MultiChainExecution {
    /** Execution result on source chain (claim tx) */
    sourceTx?: ExecutionResult;

    /** Execution result on target chain (fulfillment tx) */
    targetTx?: ExecutionResult;

    /** Current status of the paired execution */
    status: ExecutionStatus;

    /** Timestamp when execution started */
    startedAt: number;

    /** Timestamp when execution completed (both chains) */
    completedAt?: number;
}
