/**
 * Token Registry
 *
 * Central registry untuk token info (address, decimals, etc) per chain.
 * Pre-registers common tokens (USDC) untuk supported chains.
 *
 * USAGE:
 *   const registry = new TokenRegistry();
 *   registry.register({ address: "0xA0b8...", symbol: "USDC", decimals: 6, chainId: 1, name: "USD Coin" });
 *
 *   const usdc = registry.get("USDC", 1);
 *   const usdcByAddr = registry.getByAddress("0xA0b8...", 1);
 */

import type { Address, ChainId } from "../../types/common";

/**
 * Token info in the registry
 */
export interface TokenInfo {
    /** Contract address on specific chain */
    address: Address;

    /** Token symbol (e.g., "USDC", "USDT") */
    symbol: string;

    /** Token decimals (e.g., 6 for USDC, 18 for ETH) */
    decimals: number;

    /** Chain ID where this token lives */
    chainId: ChainId;

    /** Full token name (e.g., "USD Coin") */
    name: string;
}

/**
 * TokenRegistry
 *
 * Manages token info indexed by (symbol, chainId) and (address, chainId).
 */
export class TokenRegistry {
    /** symbol:chainId → TokenInfo */
    private bySymbol: Map<string, TokenInfo> = new Map();

    /** address:chainId → TokenInfo */
    private byAddress: Map<string, TokenInfo> = new Map();

    /**
     * Generate composite key for maps
     */
    private symbolKey(symbol: string, chainId: ChainId): string {
        return `${symbol.toUpperCase()}:${chainId}`;
    }

    private addressKey(address: string, chainId: ChainId): string {
        return `${address.toLowerCase()}:${chainId}`;
    }

    /**
     * Register a token.
     * Updates existing entry if same (symbol, chainId) already registered.
     */
    register(token: TokenInfo): void {
        const sKey = this.symbolKey(token.symbol, token.chainId);
        const aKey = this.addressKey(token.address, token.chainId);

        this.bySymbol.set(sKey, token);
        this.byAddress.set(aKey, token);
    }

    /**
     * Register multiple tokens at once.
     */
    registerAll(tokens: TokenInfo[]): void {
        for (const token of tokens) {
            this.register(token);
        }
    }

    /**
     * Get token by symbol and chain ID.
     * Returns undefined if not found.
     */
    get(symbol: string, chainId: ChainId): TokenInfo | undefined {
        return this.bySymbol.get(this.symbolKey(symbol, chainId));
    }

    /**
     * Get token by contract address and chain ID.
     * Returns undefined if not found.
     */
    getByAddress(address: string, chainId: ChainId): TokenInfo | undefined {
        return this.byAddress.get(this.addressKey(address, chainId));
    }

    /**
     * Check if a token is registered.
     */
    has(symbol: string, chainId: ChainId): boolean {
        return this.bySymbol.has(this.symbolKey(symbol, chainId));
    }

    /**
     * List all tokens on a specific chain.
     */
    listByChain(chainId: ChainId): TokenInfo[] {
        return Array.from(this.bySymbol.values()).filter(
            (t) => t.chainId === chainId,
        );
    }

    /**
     * List all registered tokens.
     */
    listAll(): TokenInfo[] {
        return Array.from(this.bySymbol.values());
    }

    /**
     * Get number of registered tokens.
     */
    get size(): number {
        return this.bySymbol.size;
    }
}

/**
 * Pre-configured USDC token info for common chains.
 * Register these via registry.registerAll(DEFAULT_TOKENS).
 */
export const DEFAULT_TOKENS: TokenInfo[] = [
    {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 1,
        name: "USD Coin",
    },
    {
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 137,
        name: "USD Coin",
    },
    {
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 42161,
        name: "USD Coin",
    },
];

/**
 * Testnet USDC token info for supported testnet chains.
 * Register these via registry.registerAll(TESTNET_TOKENS).
 *
 * Stage 3 — Live Integration
 *
 * Chains: Sepolia, Arbitrum Sepolia, Unichain Sepolia, Base Sepolia
 */
export const TESTNET_TOKENS: TokenInfo[] = [
    {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 11155111, // Sepolia
        name: "USD Coin (Testnet)",
    },
    {
        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 421614, // Arbitrum Sepolia
        name: "USD Coin (Testnet)",
    },
    {
        address: "0x31d0220469e10c4E71834a79b1f276d740d3768F" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 1301, // Unichain Sepolia
        name: "USD Coin (Testnet)",
    },
    {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
        symbol: "USDC",
        decimals: 6,
        chainId: 84532, // Base Sepolia
        name: "USD Coin (Testnet)",
    },
];

/**
 * Additional mainnet tokens beyond USDC.
 * Register these via registry.registerAll(MAINNET_TOKENS).
 *
 * Stage 3 — Live Integration
 *
 * Tokens: USDT, WETH, WBTC, DAI on Ethereum/Arbitrum/Optimism
 */
export const MAINNET_TOKENS: TokenInfo[] = [
    // --- USDT ---
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, symbol: "USDT", decimals: 6, chainId: 1, name: "Tether USD" },
    { address: "0xFd086bC7CD5C481DCC9C85EBE478A1C0b69FCbb9" as Address, symbol: "USDT", decimals: 6, chainId: 42161, name: "Tether USD" },
    { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" as Address, symbol: "USDT", decimals: 6, chainId: 10, name: "Tether USD" },

    // --- WETH ---
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address, symbol: "WETH", decimals: 18, chainId: 42161, name: "Wrapped Ether" },
    { address: "0x4200000000000000000000000000000000000006" as Address, symbol: "WETH", decimals: 18, chainId: 10, name: "Wrapped Ether" },

    // --- WBTC ---
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, symbol: "WBTC", decimals: 8, chainId: 1, name: "Wrapped BTC" },
    { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as Address, symbol: "WBTC", decimals: 8, chainId: 42161, name: "Wrapped BTC" },

    // --- DAI ---
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, symbol: "DAI", decimals: 18, chainId: 1, name: "Dai Stablecoin" },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" as Address, symbol: "DAI", decimals: 18, chainId: 42161, name: "Dai Stablecoin" },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" as Address, symbol: "DAI", decimals: 18, chainId: 10, name: "Dai Stablecoin" },
];

/**
 * Resolve a token address from symbol + chainId.
 *
 * Looks up the token in the provided registry instance.
 * Throws if the token is not found.
 *
 * Stage 3 — Live Integration
 *
 * @param registry - TokenRegistry instance to search in
 * @param symbol   - Token symbol (e.g., "USDC")
 * @param chainId  - Target chain ID
 * @returns The token's contract address
 * @throws Error if token not found for the given symbol + chainId
 */
export function resolveFromSymbol(
    registry: TokenRegistry,
    symbol: string,
    chainId: ChainId,
): Address {
    const token = registry.get(symbol, chainId);
    if (!token) {
        throw new Error(`Target token ${symbol} is not registered for chain ID ${chainId}`);
    }
    return token.address;
}
