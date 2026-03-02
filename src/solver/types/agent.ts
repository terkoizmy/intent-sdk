/**
 * Solver Agent Types
 *
 * Core types untuk Liquidity Agent yang menangani
 * intent fulfillment dan cross-chain settlement.
 */

import type { Address, ChainId } from "../../types/common";

/**
 * Agent operating mode
 *
 * - simulate: Dry-run tanpa eksekusi on-chain (untuk testing/development)
 * - live: Real execution on mainnet/testnet
 */
export type AgentMode = "simulate" | "live";

/**
 * Current agent status
 */
export type AgentStatus = "idle" | "processing" | "rebalancing" | "error";

/**
 * Agent Configuration
 *
 * Konfigurasi utama untuk menginisialisasi LiquidityAgent.
 *
 * CONTOH:
 *   {
 *     name: "LiquidityBot-01",
 *     privateKey: "0xabc...",
 *     supportedChains: [1, 137],
 *     supportedTokens: ["USDC"],
 *     mode: "simulate",
 *   }
 */
export interface AgentConfig {
    /** Human-readable agent name (e.g., "LiquidityBot-01") */
    name: string;

    /** Private key for signing transactions (hex string with 0x prefix) */
    privateKey: string;

    /** List of supported chain IDs (e.g., [1, 137] for ETH + Polygon) */
    supportedChains: ChainId[];

    /** List of supported token symbols (e.g., ["USDC", "USDT"]) */
    supportedTokens: string[];

    /** Operating mode: simulate (dry-run) or live (real execution) */
    mode: AgentMode;

    /** Maximum number of intents to process concurrently (default: 5) */
    maxConcurrentIntents?: number;

    /** Intent timeout in seconds — reject intents older than this (default: 3600) */
    intentTimeout?: number;

    /** Agent's registered on-chain address (derived from privateKey) */
    agentAddress?: Address;
}

/**
 * Result dari solve() operation
 *
 * Berisi status eksekusi, profit, dan metadata.
 */
export interface SolutionResult {
    /** Whether the solve was successful */
    success: boolean;

    /** Transaction hash on target chain (if executed) */
    txHash?: string;

    /** Net profit in USDC (fee + slippage - gas cost) */
    profit?: string;

    /** Output amount received by user */
    output?: string;

    /** Error message if failed */
    error?: string;

    /** Additional metadata */
    metadata?: SolutionMetadata;
}

/**
 * Metadata tambahan dari solve result
 */
export interface SolutionMetadata {
    /** Time taken to solve (milliseconds) */
    solveDurationMs: number;

    /** Source chain ID */
    sourceChainId: ChainId;

    /** Target chain ID */
    targetChainId: ChainId;

    /** Gas used on target chain */
    gasUsed?: string;

    /** Gas cost in USDC equivalent */
    gasCostUSD?: string;

    /** Fee breakdown */
    feeBreakdown?: {
        baseFee: string;
        slippageCapture: string;
        gasCost: string;
        totalFee: string;
    };
}
