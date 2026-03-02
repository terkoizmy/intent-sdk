/**
 * Agent Config — Phase F
 *
 * Aggregates all sub-module configurations into a single
 * LiquidityAgentConfig struct. Provides `buildAgentConfig()`
 * that applies SDK defaults so callers only need to specify overrides.
 *
 * Used by: LiquidityAgent constructor
 */

import type { AgentConfig, AgentMode } from "../types/agent";
import type { PricingConfig } from "../types/pricing";
import type { InventoryManagerConfig } from "../inventory/inventory-manager";
import type { SettlementConfig } from "../settlement/settlement-manager";
import type { ChainId } from "../../types/common";

// ─────────────────────────────────────────────
// LiquidityAgentConfig
// ─────────────────────────────────────────────

/**
 * Full configuration for a LiquidityAgent instance.
 *
 * Combines agent identity, pricing engine config, inventory
 * management config, and settlement config into a single object.
 *
 * EXAMPLE:
 *   const config = buildAgentConfig({
 *       agent: {
 *           name: "LiquidityBot-01",
 *           privateKey: "0xabc...",
 *           supportedChains: [1, 137],
 *           supportedTokens: ["USDC"],
 *           mode: "simulate",
 *       },
 *       contractAddress: "0xSettlementContractAddress",
 *   });
 */
export interface LiquidityAgentConfig {
    /** Core agent identity and behavior */
    agent: AgentConfig;

    /** Fee calculation parameters */
    pricing: PricingConfig;

    /** Inventory reserve and management parameters */
    inventory: InventoryManagerConfig;

    /** Settlement confirmation and retry parameters */
    settlement: SettlementConfig;

    /** Deployed IntentSettlement contract address */
    contractAddress: string;

    /** Map of chainId → RPC URL for connecting to chains */
    rpcUrls: Record<number, string>;
}

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

const DEFAULT_AGENT: AgentConfig = {
    name: "LiquidityAgent",
    privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
    supportedChains: [1, 137] as ChainId[],
    supportedTokens: ["USDC"],
    mode: "simulate" as AgentMode,
    maxConcurrentIntents: 5,
    intentTimeout: 3600,
};

const DEFAULT_PRICING: PricingConfig = {
    baseFeePercent: 0.005,
    minFeeUSD: 1,
    maxFeePercent: 0.03,
    slippageSharePercent: 0.5,
};

const DEFAULT_INVENTORY: InventoryManagerConfig = {
    minReservePercent: 0.1,
};

const DEFAULT_SETTLEMENT: SettlementConfig = {
    requiredConfirmations: 3,
    maxClaimRetries: 3,
    watchIntervalMs: 30_000,
};

// ─────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────

/**
 * Build a complete LiquidityAgentConfig by merging partial overrides
 * with SDK defaults.
 *
 * Only `agent.privateKey` and `contractAddress` are truly required
 * for a real deployment; everything else has sensible defaults.
 *
 * @param partial - Partial config object. Nested objects are shallow-merged.
 * @returns Fully populated LiquidityAgentConfig
 */
export function buildAgentConfig(
    partial: Partial<LiquidityAgentConfig> & {
        agent?: Partial<AgentConfig>;
        pricing?: Partial<PricingConfig>;
        inventory?: Partial<InventoryManagerConfig>;
        settlement?: Partial<SettlementConfig>;
    },
): LiquidityAgentConfig {
    return {
        agent: { ...DEFAULT_AGENT, ...(partial.agent ?? {}) },
        pricing: { ...DEFAULT_PRICING, ...(partial.pricing ?? {}) },
        inventory: { ...DEFAULT_INVENTORY, ...(partial.inventory ?? {}) },
        settlement: { ...DEFAULT_SETTLEMENT, ...(partial.settlement ?? {}) },
        contractAddress: partial.contractAddress ?? "0x0000000000000000000000000000000000000000",
        rpcUrls: partial.rpcUrls ?? {},
    };
}
