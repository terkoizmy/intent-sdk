/**
 * Common Primitive Types
 *
 * Low-level types yang digunakan di seluruh SDK.
 * Tidak tergantung pada module lain.
 */

/**
 * EVM address (hex string with 0x prefix, 42 characters)
 *
 * CONTOH: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
 */
export type Address = `0x${string}`;

/**
 * Amount as string (representing bigint)
 *
 * Digunakan untuk serialization karena bigint tidak bisa di-JSON.stringify.
 * Format: decimal string tanpa separators.
 *
 * CONTOH:
 *   1000 USDC (6 decimals) = "1000000000"
 *   0.5 ETH (18 decimals) = "500000000000000000"
 */
export type Amount = string;

/**
 * Chain ID (EVM chain identifier)
 *
 * CONTOH:
 *   1 = Ethereum Mainnet
 *   137 = Polygon
 *   42161 = Arbitrum One
 *   10 = Optimism
 */
export type ChainId = number;

/**
 * Transaction or data hash (hex string with 0x prefix, 66 characters)
 *
 * CONTOH: "0xabc123..."
 */
export type Hash = `0x${string}`;

/**
 * Unix timestamp in seconds
 */
export type UnixTimestamp = number;
