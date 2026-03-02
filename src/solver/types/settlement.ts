/**
 * Settlement Types
 *
 * Types untuk cross-chain settlement dan proof verification.
 * Settlement = proses claim funds di source chain setelah
 * berhasil mengirim funds di target chain.
 */

import type { Address, ChainId, Hash } from "../../types/common";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/**
 * Parameters for generating a signature proof.
 */
export interface ProofGenerationParams {
    /** Unique intent ID */
    intentId: string;

    /** Transaction hash on target chain (fulfillment tx) */
    targetTxHash: Hash;

    /** Target chain ID */
    targetChainId: ChainId;

    /** Amount transferred (in token's smallest unit) */
    amount: string;

    /** Recipient address on target chain */
    recipient: Address;

    /** Number of block confirmations to wait (default: 3) */
    confirmations?: number;
}

// ─────────────────────────────────────────────
// Interfaces for dependency injection
// ─────────────────────────────────────────────

/** Wallet signing capability (subset of WalletManager) */
export interface IProofSigner {
    getAddress(): Address | Promise<Address>;
    signMessage(message: string | Uint8Array): Promise<string>;
}

/** RPC provider capability (subset of RPCProviderManager) */
export interface IProviderForProof {
    getTransactionReceipt(chainId: ChainId, txHash: Hash): Promise<{
        blockNumber: number;
        status: number;
    } | null>;
    getBlockNumber(chainId: ChainId): Promise<number>;
}

/**
 * Settlement status
 */
export type SettlementStatus =
    | "pending"      // Waiting for target tx confirmation
    | "proving"      // Generating proof
    | "claiming"     // Submitting claim on source chain
    | "completed"    // Successfully settled
    | "failed";      // Claim failed (needs manual review)

/**
 * Settlement record
 *
 * Merepresentasikan satu settlement cycle:
 * 1. Solver kirim di target chain (targetTx)
 * 2. Generate proof
 * 3. Claim di source chain (sourceTx)
 */
export interface Settlement {
    /** Intent ID yang di-settle */
    intentId: string;

    /** Solver address yang melakukan settlement */
    solver: Address;

    /** Transaction hash di source chain (claim tx) */
    sourceTx?: Hash;

    /** Transaction hash di target chain (fulfillment tx) */
    targetTx: Hash;

    /** Cross-chain proof used for claim */
    proof?: CrossChainProof;

    /** Current settlement status */
    status: SettlementStatus;

    /** Timestamp ketika settlement selesai (Unix seconds) */
    settledAt?: number;

    /** Timestamp ketika settlement dimulai */
    startedAt: number;

    /** Number of claim attempts (for retry tracking) */
    claimAttempts: number;

    /** Error message if failed */
    error?: string;
}

/**
 * Cross-Chain Proof
 *
 * Bukti bahwa solver telah mengirim funds di target chain.
 * Digunakan untuk claim funds di source chain contract.
 *
 * Proof mechanism: EIP-712 signature dari solver atas data transfer.
 */
export interface CrossChainProof {
    /** Target chain transaction hash */
    txHash: Hash;

    /** Target chain ID */
    chainId: ChainId;

    /** Block number where target tx was included */
    blockNumber: number;

    /** Solver's EIP-712 signature over proof data */
    solverSignature: string;

    /** Data yang di-sign (untuk verification) */
    signedData?: {
        intentId: string;
        targetTxHash: Hash;
        amount: string;
        recipient: Address;
    };
}
