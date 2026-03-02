/**
 * viem RPC Provider
 *
 * Implements IRPCProvider using viem's createPublicClient + http transport.
 * Provides real JSON-RPC calls to EVM chains.
 *
 * Stage 3 — Live Integration (Phase B)
 * Updated Phase G — Retry with exponential backoff for transient errors
 *
 * USAGE:
 *   import { createViemProviderFactory } from "./viem-provider";
 *   const rpm = new RPCProviderManager(createViemProviderFactory());
 *   rpm.registerChain(SEPOLIA_CONFIG);
 *   const provider = rpm.getProvider(11155111);
 *   const blockNumber = await provider.getBlockNumber();
 */

import { createPublicClient, http } from "viem";
import type { PublicClient, HttpTransport, Chain } from "viem";
import type { ChainConfig } from "../../types/chain";
import type { Address, ChainId } from "../../types/common";
import type { IRPCProvider, ProviderFactory } from "./provider-manager";
import { withRetry, isTransientNetworkError } from "../utils/retry";
import { getChainDisplayName } from "../chain-registry/chain-names";

/** Retry options tuned for RPC calls */
const RPC_RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 5_000,
    isRetryable: isTransientNetworkError,
};

/**
 * Convert our ChainConfig into a viem-compatible Chain definition.
 */
function toViemChain(config: ChainConfig): Chain {
    return {
        id: config.id,
        name: config.name,
        nativeCurrency: config.nativeCurrency,
        rpcUrls: {
            default: { http: [config.rpcUrl, ...config.fallbackRpcUrls].filter(Boolean) as string[] },
            public: { http: [config.rpcUrl, ...config.fallbackRpcUrls].filter(Boolean) as string[] },
        },
        blockExplorers: {
            default: { name: "Explorer", url: config.explorer },
        },
    } as Chain;
}

/**
 * IRPCProvider implementation backed by viem's PublicClient.
 *
 * All RPC calls are wrapped with exponential-backoff retry for
 * transient network errors (timeouts, 429, 502/503/504).
 */
export class ViemProvider implements IRPCProvider {
    public readonly chainId: ChainId;
    private readonly chainName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private client: PublicClient<HttpTransport, any>;

    constructor(config: ChainConfig) {
        this.chainId = config.id;
        this.chainName = getChainDisplayName(config.id);

        this.client = createPublicClient({
            chain: toViemChain(config),
            transport: http(config.rpcUrl),
        });
    }

    /**
     * Call a contract view function (eth_call).
     */
    async call(to: Address, data: string): Promise<string> {
        return withRetry(async () => {
            const result = await this.client.call({ to, data: data as `0x${string}` });
            return result.data || "0x";
        }, {
            ...RPC_RETRY_OPTIONS,
            onRetry: (err, attempt) => {
                console.warn(`[ViemProvider] ${this.chainName} call() retry ${attempt}: ${err.message}`);
            },
        });
    }

    /**
     * Get current block number.
     */
    async getBlockNumber(): Promise<number> {
        return withRetry(async () => {
            const blockNumber = await this.client.getBlockNumber();
            return Number(blockNumber);
        }, {
            ...RPC_RETRY_OPTIONS,
            onRetry: (err, attempt) => {
                console.warn(`[ViemProvider] ${this.chainName} getBlockNumber() retry ${attempt}: ${err.message}`);
            },
        });
    }

    /**
     * Get transaction receipt by hash.
     */
    async getTransactionReceipt(txHash: string): Promise<{
        status: number;
        blockNumber: number;
        gasUsed: string;
    } | null> {
        try {
            return await withRetry(async () => {
                const receipt = await this.client.getTransactionReceipt({ hash: txHash as `0x${string}` });
                return {
                    status: receipt.status === "success" ? 1 : 0,
                    blockNumber: Number(receipt.blockNumber),
                    gasUsed: receipt.gasUsed.toString(),
                };
            }, {
                ...RPC_RETRY_OPTIONS,
                onRetry: (err, attempt) => {
                    console.warn(`[ViemProvider] ${this.chainName} getTransactionReceipt() retry ${attempt}: ${err.message}`);
                },
            });
        } catch (error) {
            // Receipt not found throws in viem, so we return null
            return null;
        }
    }

    /**
     * Get current gas price in wei.
     */
    async getGasPrice(): Promise<string> {
        return withRetry(async () => {
            const gasPrice = await this.client.getGasPrice();
            return gasPrice.toString();
        }, {
            ...RPC_RETRY_OPTIONS,
            onRetry: (err, attempt) => {
                console.warn(`[ViemProvider] ${this.chainName} getGasPrice() retry ${attempt}: ${err.message}`);
            },
        });
    }

    /**
     * Health check — try getBlockNumber and see if it succeeds.
     */
    async isHealthy(): Promise<boolean> {
        try {
            await this.client.getBlockNumber();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Send a signed transaction to the network.
     */
    async sendRawTransaction(signedTx: `0x${string}`): Promise<string> {
        return withRetry(async () => {
            return await this.client.sendRawTransaction({ serializedTransaction: signedTx });
        }, {
            ...RPC_RETRY_OPTIONS,
            onRetry: (err, attempt) => {
                console.warn(`[ViemProvider] ${this.chainName} sendRawTransaction() retry ${attempt}: ${err.message}`);
            },
        });
    }

    /**
     * Estimate gas for a transaction.
     */
    async estimateGas(tx: {
        to: Address;
        data?: string;
        value?: bigint;
        from?: Address;
    }): Promise<bigint> {
        return withRetry(async () => {
            const gas = await this.client.estimateGas({
                to: tx.to,
                data: tx.data as `0x${string}` | undefined,
                value: tx.value,
                account: tx.from as `0x${string}` | undefined,
            });
            return gas;
        }, {
            ...RPC_RETRY_OPTIONS,
            onRetry: (err, attempt) => {
                console.warn(`[ViemProvider] ${this.chainName} estimateGas() retry ${attempt}: ${err.message}`);
            },
        });
    }
}

/**
 * Factory function that creates ViemProvider instances.
 *
 * Pass this to RPCProviderManager constructor to wire real RPC connections.
 *
 * USAGE:
 *   const rpm = new RPCProviderManager(createViemProviderFactory());
 */
export function createViemProviderFactory(): ProviderFactory {
    return (config: ChainConfig): IRPCProvider => {
        return new ViemProvider(config);
    };
}
