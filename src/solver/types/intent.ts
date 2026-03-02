/**
 * Solver Intent Types
 *
 * Types khusus solver — merepresentasikan intent yang sudah
 * di-parse dan siap untuk diproses oleh LiquidityAgent.
 *
 * Extends dari parser types (StructuredIntent) dengan
 * menambahkan solver-specific fields.
 */

import type { StructuredIntent } from "../../types/intent";
import type { Address, ChainId, Hash } from "../../types/common";

/**
 * Status lifecycle dari sebuah intent di sisi solver
 *
 *  pending → matched → fulfilling → fulfilled
 *                └→ failed
 *                └→ refunded
 */
export type IntentStatus =
    | "pending"      // Baru masuk, belum di-match
    | "matched"      // Sudah di-match, sedang prepare
    | "fulfilling"   // Sedang di-execute (sending on target chain)
    | "fulfilled"    // Berhasil di-settle
    | "failed"       // Gagal (lock released, inventory restored)
    | "refunded";    // Refund ke user (deadline passed)

/**
 * Solver Intent
 *
 * Representasi intent dari perspektif solver.
 * Menggabungkan data dari parser (StructuredIntent) dengan
 * solver-specific metadata (intentId, hash, signature, dsb).
 */
export interface SolverIntent {
    /** Unique intent ID (uuid or on-chain ID) */
    intentId: string;

    /** Keccak256 hash of intent data — used for verification */
    intentHash: Hash;

    /** User's wallet address (intent originator) */
    user: Address;

    /** User's signature over intentHash */
    signature: string;

    /** Deadline timestamp (Unix seconds) — intent expired after this */
    deadline: number;

    /** Current status in solver pipeline */
    status: IntentStatus;

    /** Original parsed intent from parser */
    parsedIntent: StructuredIntent;

    /** Timestamp when solver received this intent */
    receivedAt: number;

    /** Solver address yang memproses intent ini */
    solver?: Address;
}

/**
 * Bridge Intent
 *
 * Specialized intent type untuk cross-chain bridge operations.
 * Ini adalah intent type utama yang di-handle oleh LiquidityAgent.
 *
 * CONTOH:
 *   "Bridge 1000 USDC from Ethereum to Polygon"
 *   → {
 *       sourceChain: 1,
 *       targetChain: 137,
 *       token: "USDC",
 *       amount: "1000000000",   // 1000 * 10^6
 *       recipient: "0xabc...",
 *       maxSlippage: 50,        // 0.5%
 *     }
 */
export interface BridgeIntent {
    /** Source chain ID (where user's funds are locked) */
    sourceChain: ChainId;

    /** Target chain ID (where solver sends funds) */
    targetChain: ChainId;

    /** Token symbol (e.g., "USDC") */
    token: string;

    /** Amount in token's smallest unit */
    amount: string;

    /** Recipient address on target chain */
    recipient: Address;

    /** Maximum acceptable slippage in basis points (100 = 1%) */
    maxSlippage: number;
}

/**
 * Helper: Extract BridgeIntent dari SolverIntent
 */
export function toBridgeIntent(intent: SolverIntent): BridgeIntent | null {
    const params = intent.parsedIntent.parameters;

    if (intent.parsedIntent.intentType !== "bridge") return null;

    if (
        !params.sourceChain ||
        !params.targetChain ||
        !params.inputToken ||
        !params.inputAmount ||
        !params.recipient
    ) {
        return null;
    }

    return {
        sourceChain: Number(params.sourceChain) as ChainId,
        targetChain: Number(params.targetChain) as ChainId,
        token: params.inputToken,
        amount: params.inputAmount,
        recipient: params.recipient as Address,
        maxSlippage: intent.parsedIntent.constraints.maxSlippage ?? 50,
    };
}
