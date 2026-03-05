/**
 * Testnet Chain Configurations
 *
 * Pre-configured chain data for supported testnet networks.
 * Import SUPPORTED_TESTNETS to register all testnet chains
 * or import individual configs.
 *
 * Stage 3 — Live Integration
 */

import type { ChainConfig } from "../types/chain";
import type { Address } from "../types/common";

/**
 * Ethereum Sepolia Testnet Configuration
 */
export const SEPOLIA_CONFIG: ChainConfig = {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    fallbackRpcUrls: [
        "https://rpc.sepolia.org",
    ],
    nativeCurrency: {
        name: "Sepolia Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://sepolia.etherscan.io",
    contracts: {
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    },
    blockTimeSeconds: 12,
    confirmations: 2,
};

/**
 * Arbitrum Sepolia Testnet Configuration
 */
export const ARBITRUM_SEPOLIA_CONFIG: ChainConfig = {
    id: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: process.env.ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    fallbackRpcUrls: [
        "https://arbitrum-sepolia-rpc.publicnode.com",
    ],
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://sepolia.arbiscan.io",
    contracts: {
        usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as Address,
    },
    blockTimeSeconds: 0.25,
    confirmations: 1,
};

/**
 * Unichain Sepolia Testnet Configuration
 */
export const UNICHAIN_SEPOLIA_CONFIG: ChainConfig = {
    id: 1301,
    name: "Unichain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org",
    fallbackRpcUrls: [],
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://unichain-sepolia.blockscout.com",
    contracts: {
        usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F" as Address,
    },
    blockTimeSeconds: 1,
    confirmations: 1,
};

/**
 * Base Sepolia Testnet Configuration
 */
export const BASE_SEPOLIA_CONFIG: ChainConfig = {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    fallbackRpcUrls: [
        "https://base-sepolia-rpc.publicnode.com",
    ],
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    explorer: "https://sepolia.basescan.org",
    contracts: {
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
    },
    blockTimeSeconds: 2,
    confirmations: 1,
};

/**
 * All supported testnet chain configurations
 */
export const SUPPORTED_TESTNETS: ChainConfig[] = [
    SEPOLIA_CONFIG,
    ARBITRUM_SEPOLIA_CONFIG,
    UNICHAIN_SEPOLIA_CONFIG,
    BASE_SEPOLIA_CONFIG,
];
