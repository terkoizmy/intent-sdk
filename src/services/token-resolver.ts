import type {
    ResolvedToken,
    TokenResolverConfig,
    TokenCacheEntry,
    SwingTokenResponse,
} from "../types/token";

/**
 * Token Resolver Service
 *
 * Resolve token symbol + chain → contract address menggunakan Swing.xyz API.
 * Includes built-in caching untuk menghindari API call berulang.
 *
 * API ENDPOINT: https://platform.swing.xyz/api/v1/tokens?chain={chain}&symbol={symbol}
 * - Public API, tidak perlu API key
 * - Support EVM chains (Ethereum, Polygon, Arbitrum, etc.) + Solana
 * - Response: { symbol, name, address, decimals, price, chain, logo }
 *
 * CONTOH PENGGUNAAN:
 *   const resolver = new TokenResolver({ enabled: true, cacheTTL: 300_000, timeout: 5000 });
 *   const token = await resolver.resolve("USDC", "polygon");
 *   // → { symbol: "USDC", address: "0x3c499c...", decimals: 6, chain: "polygon" }
 *
 * CACHING:
 *   - Cache key: "${SYMBOL}:${chain}" (e.g., "USDC:polygon")
 *   - TTL: configurable, default 5 menit
 *   - Jika cache hit dan belum expired → return cached, skip API call
 *
 * ERROR HANDLING:
 *   - Jika API down / timeout → return null (parser tetap berfungsi tanpa address)
 *   - Jika token tidak ditemukan → return null
 *   - Tidak throw error — selalu graceful
 */
export class TokenResolver {
    private config: TokenResolverConfig;
    private cache: Map<string, TokenCacheEntry>;

    private static readonly BASE_URL =
        "https://platform.swing.xyz/api/v1/tokens";

    /**
     * Constructor
     *
     * INPUT: TokenResolverConfig
     *   - enabled: boolean (default: true)
     *   - cacheTTL: number in ms (default: 300_000 = 5 min)
     *   - timeout: number in ms (default: 5000)
     *   - customResolver?: (symbol, chain) => Promise<ResolvedToken | null>
     */
    constructor(config: Partial<TokenResolverConfig> = {}) {
        this.config = {
            enabled: config.enabled ?? true,
            cacheTTL: config.cacheTTL ?? 300_000,
            timeout: config.timeout ?? 5000,
            maxCacheSize: config.maxCacheSize ?? 1000,
            customResolver: config.customResolver,
        };

        this.cache = new Map();
    }

    /**
     * Resolve a token symbol on a specific chain to its contract address
     *
     * INPUT:
     *   - symbol: Token symbol, e.g., "USDC", "ETH", "WBTC"
     *   - chain: Chain name, e.g., "ethereum", "polygon", "solana"
     *
     * OUTPUT:
     *   - Promise<ResolvedToken | null>
     *   - Returns null jika: disabled, token not found, API error, timeout
     *
     * FLOW:
     *   1. Jika disabled → return null
     *   2. Jika customResolver disediakan → gunakan itu
     *   3. Check cache → jika hit dan belum expired → return cached
     *   4. Call Swing.xyz API
     *   5. Parse response → map ke ResolvedToken
     *   6. Simpan ke cache
     *   7. Return ResolvedToken
     *
     * ERROR: Tidak throw. Jika terjadi error apapun → return null
     */
    async resolve(symbol: string, chain: string): Promise<ResolvedToken | null> {
        // Step 1: Early return jika disabled
        if (!this.config.enabled) return null;

        // Step 2: Jika customResolver disediakan, gunakan itu
        if (this.config.customResolver) {
            return this.config.customResolver(symbol, chain);
        }

        // Step 3: Check cache
        const cacheKey = this.getCacheKey(symbol, chain);
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        // Step 4: Call Swing.xyz API via fetchFromSwing()
        const resolved = await this.fetchFromSwing(symbol, chain);

        // Step 5: Cache result jika berhasil
        if (resolved) {
            this.setCache(cacheKey, resolved);
        }

        // Step 6: Return result
        return resolved;
    }

    /**
     * Resolve multiple tokens in parallel
     *
     * INPUT:
     *   - tokens: Array of { symbol, chain } objects
     *
     * OUTPUT:
     *   - Promise<Map<string, ResolvedToken | null>>
     *   - Map key = "SYMBOL:chain" (e.g., "USDC:polygon")
     *
     * CONTOH:
     *   const results = await resolver.resolveMany([
     *     { symbol: "USDC", chain: "ethereum" },
     *     { symbol: "ETH", chain: "polygon" },
     *   ]);
     *   // results.get("USDC:ethereum") → { address: "0xA0b8..." }
     */
    async resolveMany(
        tokens: Array<{ symbol: string; chain: string }>,
    ): Promise<Map<string, ResolvedToken | null>> {
        // Step 1: Map each token ke Promise<[key, ResolvedToken | null]>
        const promises = tokens.map(async ({ symbol, chain }) => {
            const key = this.getCacheKey(symbol, chain);
            const resolved = await this.resolve(symbol, chain);
            return [key, resolved] as const;
        });

        // Step 2: Promise.allSettled() untuk parallel execution
        const results = await Promise.allSettled(promises);

        // Step 3: Build result map
        const resultMap = new Map<string, ResolvedToken | null>();
        for (const result of results) {
            if (result.status === "fulfilled") {
                resultMap.set(result.value[0], result.value[1]);
            }
        }
        return resultMap;
    }

    /**
     * Fetch token data from Swing.xyz API
     *
     * INPUT:
     *   - symbol: Token symbol (e.g., "USDC")
     *   - chain: Chain name (e.g., "polygon")
     *
     * OUTPUT:
     *   - Promise<ResolvedToken | null>
     *
     * API CALL:
     *   GET https://platform.swing.xyz/api/v1/tokens?chain={chain}&symbol={symbol}
     *   Headers: { "x-swing-environment": "" }
     *
     * RESPONSE SHAPE (array):
     *   [{ symbol, name, address, decimals, logo, chain, price, ... }]
     *
     * MAPPING:
     *   SwingTokenResponse → ResolvedToken:
     *   - symbol → symbol
     *   - address → address
     *   - decimals → decimals
     *   - chain → chain
     *   - name → name
     *   - price → price
     *   - logo → logoUrl
     *
     * ERROR HANDLING:
     *   - Wrap in try/catch
     *   - Use AbortController for timeout
     *   - Return null on any error
     */
    private async fetchFromSwing(
        symbol: string,
        chain: string,
    ): Promise<ResolvedToken | null> {
        // Step 1: Build URL
        const url = `${TokenResolver.BASE_URL}?chain=${encodeURIComponent(chain)}&symbol=${encodeURIComponent(symbol)}`;

        // Step 2: Setup AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            // Step 3: Fetch
            const response = await fetch(url, {
                headers: { "x-swing-environment": "" },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // Step 4: Parse response
            if (!response.ok) return null;
            const data: any = await response.json();

            // Handle Swing API response format wrapped in "value" if present (some APIs wrap list in value object)
            // Based on user provided curl output: {"value": [...], "Count": 1} is possible?
            // Wait, previous curl output showed:
            // { "value": [ ... ] }
            // So we need to access data.value if it exists.

            const tokens: SwingTokenResponse[] = Array.isArray(data) ? data : (data.value || []);

            // Step 5: Validasi — API return array, ambil pertama
            if (!tokens || tokens.length === 0) return null;
            const token = tokens[0];

            // Step 6: Map ke ResolvedToken
            return {
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                chain: token.chain,
                name: token.name,
                price: token.price,
                logoUrl: token.logo,
            };
        } catch (error) {
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Generate cache key dari symbol dan chain
     *
     * INPUT: symbol ("USDC"), chain ("polygon")
     * OUTPUT: "USDC:polygon" (symbol uppercase, chain lowercase)
     */
    private getCacheKey(symbol: string, chain: string): string {
        return `${symbol.toUpperCase()}:${chain.toLowerCase()}`;
    }

    /**
     * Get dari cache jika ada dan belum expired
     *
     * INPUT: Cache key (e.g., "USDC:polygon")
     * OUTPUT: ResolvedToken | null
     *
     * LOGIC:
     *   1. Check apakah key ada di Map
     *   2. Check apakah (now - cachedAt) < cacheTTL
     *   3. Jika expired → delete entry, return null
     *   4. Jika valid → return token
     */
    private getFromCache(key: string): ResolvedToken | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const isExpired = Date.now() - entry.cachedAt > this.config.cacheTTL;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }

        return entry.token;
    }

    private setCache(key: string, token: ResolvedToken): void {
        // Evict oldest entry if cache is full
        if (this.cache.size >= this.config.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            token,
            cachedAt: Date.now(),
        });
    }

    clearCache(): void {
        this.cache.clear();
    }
}
