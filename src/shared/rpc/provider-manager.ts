/**
 * RPC Provider Manager
 *
 * Manages JSON-RPC provider connections to multiple chains.
 * Features: caching, fallback URLs, basic ERC20 balance queries.
 *
 * NOTE: Ini adalah lightweight abstraction.
 * Provider-specific logic (ethers.JsonRpcProvider / viem publicClient)
 * diinject via factory pattern.
 *
 * USAGE:
 *   const rpm = new RPCProviderManager(chainRegistry);
 *   const balance = await rpm.getTokenBalance(137, usdcAddr, walletAddr);
 */

import type { ChainConfig } from "../../types/chain";
import type { Address, ChainId } from "../../types/common";
import { getChainDisplayName } from "../chain-registry/chain-names";

/**
 * Abstract RPC Provider interface
 *
 * Abstraction atas JSON-RPC calls. Implement with ethers.js, viem, or fetch.
 */
export interface IRPCProvider {
    /** Chain ID this provider is connected to */
    chainId: ChainId;

    /** Call a contract view function */
    call(to: Address, data: string): Promise<string>;

    /** Get current block number */
    getBlockNumber(): Promise<number>;

    /** Get transaction receipt */
    getTransactionReceipt(txHash: string): Promise<{
        status: number;
        blockNumber: number;
        gasUsed: string;
    } | null>;

    /** Get gas price in wei */
    getGasPrice(): Promise<string>;

    /** Check if provider is healthy */
    isHealthy(): Promise<boolean>;

    /**
     * Send a signed (serialized) transaction to the network.
     * Returns the transaction hash.
     *
     * Stage 3 — Phase B addition
     */
    sendRawTransaction?(signedTx: `0x${string}`): Promise<string>;

    /**
     * Estimate gas required for a transaction.
     *
     * Stage 3 — Phase B addition
     */
    estimateGas?(tx: {
        to: Address;
        data?: string;
        value?: bigint;
        from?: Address;
    }): Promise<bigint>;
}

/**
 * Provider factory function type
 *
 * Given a chain config, create an IRPCProvider.
 * Memungkinkan inject ethers.js atau viem tanpa hard dependency.
 */
export type ProviderFactory = (config: ChainConfig) => IRPCProvider;

/**
 * RPCProviderManager
 *
 * Central manager for all RPC providers across chains.
 * Auto-creates and caches providers per chain.
 */
export class RPCProviderManager {
    private providers: Map<ChainId, IRPCProvider> = new Map();
    private chainConfigs: Map<ChainId, ChainConfig> = new Map();
    private providerFactory?: ProviderFactory;

    constructor(providerFactory?: ProviderFactory) {
        this.providerFactory = providerFactory;
    }

    /**
     * Set or update the provider factory after instantiation.
     */
    setProviderFactory(factory: ProviderFactory): void {
        this.providerFactory = factory;
    }

    /**
     * Register a chain config (called by initialization logic)
     */
    registerChain(config: ChainConfig): void {
        this.chainConfigs.set(config.id, config);
    }

    /**
     * Register multiple chain configs
     */
    registerChains(configs: ChainConfig[]): void {
        for (const config of configs) {
            this.registerChain(config);
        }
    }

    /**
     * Get or create a provider for a specific chain.
     * Providers are cached after first creation.
     *
     * Throws if no provider factory is configured or chain is not registered.
     */
    getProvider(chainId: ChainId): IRPCProvider {
        // Return cached provider
        const cached = this.providers.get(chainId);
        if (cached) return cached;

        // Create new provider
        const config = this.chainConfigs.get(chainId);
        if (!config) {
            throw new Error(`Chain ${getChainDisplayName(chainId)} is not registered in RPCProviderManager`);
        }

        if (!this.providerFactory) {
            throw new Error(
                "RPCProviderManager requires a providerFactory. " +
                "Provide one via constructor.",
            );
        }

        const provider = this.providerFactory(config);
        this.providers.set(chainId, provider);
        return provider;
    }

    /**
     * Get ERC20 token balance for a wallet on a specific chain.
     *
     * Calls balanceOf(address) on the token contract.
     * Returns balance in token's smallest unit.
     */
    async getTokenBalance(
        chainId: ChainId,
        tokenAddress: Address,
        walletAddress: Address,
    ): Promise<bigint> {
        const provider = this.getProvider(chainId);

        // ERC20 balanceOf(address) selector = 0x70a08231
        // ABI encode: selector + padded address
        const data =
            "0x70a08231" +
            walletAddress.slice(2).padStart(64, "0");

        const result = await provider.call(tokenAddress, data);
        // Parse hex result to bigint
        if (!result || result === "0x" || result === "0x0") {
            return 0n;
        }

        return BigInt(result);
    }

    /**
     * Check if all registered chains have healthy providers.
     */
    async checkHealth(): Promise<Map<ChainId, boolean>> {
        const results = new Map<ChainId, boolean>();

        for (const chainId of this.chainConfigs.keys()) {
            try {
                const provider = this.getProvider(chainId);
                const healthy = await provider.isHealthy();
                results.set(chainId, healthy);
            } catch {
                results.set(chainId, false);
            }
        }

        return results;
    }

    /**
     * Clear all cached providers (for testing or reconnection).
     */
    clearProviders(): void {
        this.providers.clear();
    }
}
