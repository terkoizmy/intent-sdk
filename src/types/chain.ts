/**
 * Chain Configuration Types
 *
 * Konfigurasi per-chain untuk EVM networks.
 */

import type { Address, ChainId } from "./common";

/**
 * Native currency info for a chain
 */
export interface NativeCurrency {
    /** Currency name (e.g., "Ether") */
    name: string;

    /** Currency symbol (e.g., "ETH") */
    symbol: string;

    /** Decimals (always 18 for EVM native) */
    decimals: number;
}

/**
 * Contract addresses deployed on a specific chain
 */
export interface ChainContracts {
    /** IntentSettlement contract address */
    intentSettlement?: Address;

    /** ERC-8004 Agent Registry address */
    agentRegistry?: Address;

    /** USDC token address on this chain */
    usdc?: Address;
}

/**
 * Chain Configuration
 *
 * Full config for an EVM chain.
 * Dipakai oleh ChainRegistry, RPCProviderManager, WalletManager.
 *
 * CONTOH:
 *   {
 *     id: 1,
 *     name: "Ethereum",
 *     rpcUrl: "https://eth.llamarpc.com",
 *     fallbackRpcUrls: ["https://rpc.ankr.com/eth"],
 *     nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
 *     explorer: "https://etherscan.io",
 *     contracts: { usdc: "0xA0b86991..." }
 *   }
 */
export interface ChainConfig {
    /** Chain ID (e.g., 1 for Ethereum, 137 for Polygon) */
    id: ChainId;

    /** Human-readable chain name */
    name: string;

    /** Primary RPC URL */
    rpcUrl: string;

    /** Fallback RPC URLs (tried in order if primary fails) */
    fallbackRpcUrls: string[];

    /** Native currency information */
    nativeCurrency: NativeCurrency;

    /** Block explorer base URL */
    explorer: string;

    /** Deployed contract addresses on this chain */
    contracts: ChainContracts;

    /** Average block time in seconds (for confirmation estimates) */
    blockTimeSeconds?: number;

    /** Number of confirmations to wait (default: 12) */
    confirmations?: number;
}
