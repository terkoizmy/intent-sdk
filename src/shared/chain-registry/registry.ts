/**
 * Chain Registry
 *
 * Central registry for all supported EVM chain configurations.
 * Singleton-like pattern — register once, lookup by chainId.
 *
 * USAGE:
 *   const registry = new ChainRegistry();
 *   registry.register(ETHEREUM_CONFIG);
 *   registry.register(POLYGON_CONFIG);
 *
 *   const eth = registry.get(1);
 *   console.log(eth.name); // "Ethereum"
 */

import type { ChainConfig } from "../../types/chain";
import type { ChainId } from "../../types/common";
import { getChainDisplayName } from "./chain-names";

export class ChainRegistry {
    private chains: Map<ChainId, ChainConfig> = new Map();

    /**
     * Register a chain configuration.
     * Throws if chain with same ID is already registered.
     */
    register(config: ChainConfig): void {
        if (this.chains.has(config.id)) {
            throw new Error(
                `Chain ${config.id} (${config.name}) is already registered`,
            );
        }
        this.chains.set(config.id, config);
    }

    /**
     * Register multiple chains at once.
     */
    registerAll(configs: ChainConfig[]): void {
        for (const config of configs) {
            this.register(config);
        }
    }

    /**
     * Get chain config by ID.
     * Throws if chain is not registered.
     */
    get(chainId: ChainId): ChainConfig {
        const config = this.chains.get(chainId);
        if (!config) {
            throw new Error(`Chain ${getChainDisplayName(chainId)} is not registered`);
        }
        return config;
    }

    /**
     * Check if a chain is registered.
     */
    has(chainId: ChainId): boolean {
        return this.chains.has(chainId);
    }

    /**
     * Get all registered chain configs.
     */
    list(): ChainConfig[] {
        return Array.from(this.chains.values());
    }

    /**
     * Get all registered chain IDs.
     */
    listIds(): ChainId[] {
        return Array.from(this.chains.keys());
    }

    /**
     * Get number of registered chains.
     */
    get size(): number {
        return this.chains.size;
    }
}
