/**
 * Default Configurations
 *
 * Sensible defaults untuk semua configurable aspects of the solver.
 * Override individual fields saat creating AgentConfig.
 */

import type { PricingConfig } from "../solver/types/pricing";
import type { InventoryConfig } from "../solver/types/inventory";

/**
 * Default pricing configuration
 *
 * - 0.5% base fee
 * - Minimum $1 fee
 * - Max 3% fee cap
 * - 50% slippage share
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
    baseFeePercent: 0.005,
    minFeeUSD: 1,
    maxFeePercent: 0.03,
    slippageSharePercent: 0.5,
};

/**
 * Default inventory configuration
 *
 * - Keep minimum 10% reserve per chain
 * - Trigger rebalance if >15% deviation from target
 * - Poll balances every 30s
 */
export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
    minReservePercent: 0.1,
    rebalanceThreshold: 0.15,
    pollingIntervalMs: 30_000,
};

/**
 * Default agent configuration partial
 *
 * Used by buildAgentConfig() to merge with user-provided config.
 */
export const DEFAULT_AGENT_SETTINGS = {
    /** Operating mode */
    mode: "simulate" as const,

    /** Maximum concurrent intents to process */
    maxConcurrentIntents: 5,

    /** Intent timeout in seconds (1 hour) */
    intentTimeout: 3600,
} as const;
