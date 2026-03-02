/**
 * Chain Configurations
 *
 * Pre-configured chain data for supported networks.
 * Import SUPPORTED_CHAINS to register semua chains
 * atau import individual configs.
 */

import type { ChainConfig } from "../types/chain";
import type { Address } from "../types/common";

/**
 * Ethereum Mainnet Configuration
 */
export const ETHEREUM_CONFIG: ChainConfig = {
    id: 1,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    fallbackRpcUrls: [
        "https://rpc.ankr.com/eth",
        "https://ethereum-rpc.publicnode.com",
    ],
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://etherscan.io",
    contracts: {
        usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    },
    blockTimeSeconds: 12,
    confirmations: 12,
};

/**
 * Polygon PoS Configuration
 */
export const POLYGON_CONFIG: ChainConfig = {
    id: 137,
    name: "Polygon",
    rpcUrl: "https://polygon.llamarpc.com",
    fallbackRpcUrls: [
        "https://rpc.ankr.com/polygon",
        "https://polygon-bor-rpc.publicnode.com",
    ],
    nativeCurrency: {
        name: "POL",
        symbol: "POL",
        decimals: 18,
    },
    explorer: "https://polygonscan.com",
    contracts: {
        usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address,
    },
    blockTimeSeconds: 2,
    confirmations: 30,
};

/**
 * Arbitrum One Configuration
 */
export const ARBITRUM_CONFIG: ChainConfig = {
    id: 42161,
    name: "Arbitrum One",
    rpcUrl: "https://arbitrum.llamarpc.com",
    fallbackRpcUrls: [
        "https://rpc.ankr.com/arbitrum",
        "https://arbitrum-one-rpc.publicnode.com",
    ],
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://arbiscan.io",
    contracts: {
        usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    },
    blockTimeSeconds: 0.25,
    confirmations: 12,
};

/**
 * All supported chain configurations
 */
export const SUPPORTED_CHAINS: ChainConfig[] = [
    ETHEREUM_CONFIG,
    POLYGON_CONFIG,
    ARBITRUM_CONFIG,
];
