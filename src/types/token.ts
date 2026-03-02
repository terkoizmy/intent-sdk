/**
 * Token Resolver Types
 *
 * Types untuk Token Resolver service yang menggunakan Swing.xyz API
 * untuk resolve token symbol + chain → contract address.
 */

/**
 * Resolved Token
 *
 * Hasil resolve dari API setelah lookup symbol + chain.
 *
 * CONTOH:
 *   resolve("USDC", "polygon") → {
 *     symbol: "USDC",
 *     address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
 *     decimals: 6,
 *     chain: "polygon",
 *     name: "USD Coin",
 *     price: 0.9999
 *   }
 */
export interface ResolvedToken {
    /** Token symbol (e.g., "USDC", "ETH") */
    symbol: string;

    /** Contract address on the specified chain */
    address: string;

    /** Token decimals (e.g., 6 for USDC, 18 for ETH) */
    decimals: number;

    /** Chain identifier (e.g., "ethereum", "polygon", "solana") */
    chain: string;

    /** Full token name (e.g., "USD Coin") — optional */
    name?: string;

    /** Current price in USD — optional */
    price?: number;

    /** Logo URL — optional */
    logoUrl?: string;
}

/**
 * Token Resolver Configuration
 *
 * Konfigurasi untuk TokenResolver service.
 * Bisa di-pass via ParserConfig saat inisialisasi IntentParser.
 *
 * CONTOH PENGGUNAAN:
 *   const parser = new IntentParser({
 *     tokenResolver: {
 *       enabled: true,
 *       cacheTTL: 300_000,  // 5 menit
 *       timeout: 5000,      // 5 detik
 *     }
 *   });
 *
 *   // Atau dengan custom resolver:
 *   const parser = new IntentParser({
 *     tokenResolver: {
 *       enabled: true,
 *       customResolver: async (symbol, chain) => {
 *         // Custom logic, e.g., from local database
 *         return { symbol, address: "0x...", decimals: 18, chain };
 *       }
 *     }
 *   });
 */
export interface TokenResolverConfig {
    /**
     * Enable/disable token resolver
     * Jika false, parser tidak akan melakukan API call → tetap sync
     * Default: true
     */
    enabled: boolean;

    /**
     * Cache Time-To-Live dalam milliseconds
     * Hasil resolve di-cache selama durasi ini untuk menghindari API call berulang
     * Default: 300_000 (5 menit)
     */
    cacheTTL: number;

    /**
     * Request timeout dalam milliseconds
     * Jika API tidak merespon dalam durasi ini, resolve return null
     * Default: 5000 (5 detik)
     */
    timeout: number;

    /**
     * Maximum number of entries in cache
     * When exceeded, oldest entries are evicted (FIFO)
     * Default: 1000
     */
    maxCacheSize: number;

    /**
     * Custom resolver function — override Swing.xyz API
     *
     * INPUT: symbol (e.g., "USDC"), chain (e.g., "polygon")
     * OUTPUT: Promise<ResolvedToken | null>
     *
     * Jika disediakan, Swing.xyz API TIDAK akan dipanggil.
     * Useful untuk:
     * - Testing (mock resolver)
     * - Production (pakai API internal / database sendiri)
     * - Offline mode (pakai static token list)
     */
    customResolver?: (
        symbol: string,
        chain: string,
    ) => Promise<ResolvedToken | null>;
}

/**
 * Cache entry untuk internal use di TokenResolver
 */
export interface TokenCacheEntry {
    /** Resolved token data */
    token: ResolvedToken;

    /** Timestamp saat entry di-cache (Date.now()) */
    cachedAt: number;
}

/**
 * Swing.xyz API Response shape
 *
 * Berdasarkan: GET https://platform.swing.xyz/api/v1/tokens?chain={chain}&symbol={symbol}
 *
 * Response adalah array of tokens (biasanya 1 untuk exact match).
 */
export interface SwingTokenResponse {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logo: string;
    chain: string;
    price: number;
    marketCap?: number;
    totalVolume?: number;
    totalSupply?: number;
    coingeckoId?: string;
}
