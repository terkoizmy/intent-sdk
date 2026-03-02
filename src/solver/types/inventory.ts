/**
 * Inventory Management Types
 *
 * Types untuk tracking balance USDC/token di semua chains
 * dan rebalancing antar chain.
 */

import type { ChainId } from "../../types/common";

/**
 * Balance on a single chain for a single token
 *
 * Tracks available, locked, and total balance.
 * Locked = reserved for pending intent fulfillment.
 */
export interface InventoryBalance {
    /** Chain ID where this balance is held */
    chainId: ChainId;

    /** Token symbol (e.g., "USDC") */
    token: string;

    /** Available balance (not locked) — in token's smallest unit (e.g., 6 decimals for USDC) */
    available: bigint;

    /** Locked balance (reserved for pending intents) */
    locked: bigint;

    /** Timestamp when this balance was last refreshed from on-chain */
    lastUpdated: number;
}

/**
 * Full inventory snapshot across all chains
 *
 * Digunakan untuk monitoring dashboard & rebalancing decisions.
 */
export interface InventorySnapshot {
    /** All balances across chains and tokens */
    balances: InventoryBalance[];

    /** Total value in USD (sum of all token balances) */
    totalUSDValue: string;

    /** Timestamp ketika snapshot diambil */
    timestamp: number;
}

/**
 * Rebalancing task priority
 */
export type RebalancePriority = "low" | "medium" | "high" | "critical";

/**
 * Task untuk rebalancing token antar chain
 *
 * CONTOH:
 *   {
 *     fromChain: 1,       // Ethereum
 *     toChain: 137,       // Polygon
 *     token: "USDC",
 *     amount: 50000n * 10n**6n, // 50,000 USDC
 *     reason: "Polygon balance below 20% threshold",
 *     priority: "high"
 *   }
 */
export interface RebalanceTask {
    /** Source chain ID (where we have excess) */
    fromChain: ChainId;

    /** Target chain ID (where we need more) */
    toChain: ChainId;

    /** Token symbol to rebalance */
    token: string;

    /** Amount to bridge (in token's smallest unit) */
    amount: bigint;

    /** Human-readable reason for rebalancing */
    reason: string;

    /** Task priority — critical tasks are executed first */
    priority: RebalancePriority;
}

/**
 * Inventory configuration
 */
export interface InventoryConfig {
    /** Minimum reserve percentage per chain (0-1). Default: 0.1 (10%) */
    minReservePercent: number;

    /** Rebalance trigger threshold (0-1). Default: 0.15 (15% deviation) */
    rebalanceThreshold: number;

    /** Target distribution per chain (chainId → percentage). If not set, distributes equally */
    targetDistribution?: Record<ChainId, number>;

    /** Polling interval for balance refresh (milliseconds). Default: 30_000 */
    pollingIntervalMs?: number;
}
