/**
 * Chain Names — Human-Readable Display Names
 *
 * Static lookup map for well-known EVM chain IDs.
 * Zero external dependencies — used across error messages and logging.
 *
 * Stage 3 — Phase G (Production Hardening)
 */

/**
 * Well-known EVM chain ID → human-readable name.
 */
export const CHAIN_NAMES: Record<number, string> = {
    // Mainnets
    1: "Ethereum",
    10: "Optimism",
    56: "BNB Chain",
    100: "Gnosis",
    137: "Polygon",
    250: "Fantom",
    324: "zkSync Era",
    8453: "Base",
    42161: "Arbitrum One",
    43114: "Avalanche",
    59144: "Linea",
    534352: "Scroll",

    // Testnets
    5: "Goerli",
    1301: "Unichain Sepolia",
    11155111: "Sepolia",
    84532: "Base Sepolia",
    421614: "Arbitrum Sepolia",
    11155420: "Optimism Sepolia",
};

/**
 * Get a human-readable display name for a chain ID.
 *
 * Returns `"Ethereum (1)"` for known chains or `"Unknown Chain (99999)"` for unknown.
 *
 * @param chainId - Numeric EVM chain ID
 * @returns Display string like `"Arbitrum One (42161)"`
 */
export function getChainDisplayName(chainId: number): string {
    const name = CHAIN_NAMES[chainId];
    if (name) {
        return `${name} (${chainId})`;
    }
    return `Unknown Chain (${chainId})`;
}
