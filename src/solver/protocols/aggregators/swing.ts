/**
 * Swing Protocol Integration — Phase D (Live Integration)
 *
 * DEX/Bridge aggregator integration using Swing.xyz API.
 * Provides quoting and transaction building for cross-chain inventory rebalancing.
 *
 * Phase D changes vs Phase I:
 * - FetchHttpClient now handles HTTP 429 (rate limit) and 401 (auth) errors gracefully
 * - Added getTokens(chainId) for on-chain token discovery from Swing API
 * - quote() validates real Swing API v0 response shape more strictly
 */

import { BaseProtocol, type ProtocolType, type ProtocolQuote, type QuoteParams } from "../base-protocol";
import type { Transaction } from "../../types/execution";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IHttpClient {
    get(url: string, headers?: Record<string, string>): Promise<any>;
    post(url: string, body: any, headers?: Record<string, string>): Promise<any>;
}

/** Token info returned by Swing /tokens endpoint */
export interface SwingToken {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
    chainId: number;
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

export class SwingAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SwingAuthError";
    }
}

export class SwingRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SwingRateLimitError";
    }
}

/** Default Fetch-based HTTP Client with Phase D error handling */
export class FetchHttpClient implements IHttpClient {
    constructor(private readonly maxRetries = 1) { }

    private async handleResponse(res: Response, retryFn: () => Promise<any>, attempt: number): Promise<any> {
        if (res.status === 401) {
            throw new SwingAuthError("Swing API key is invalid or missing. Please ensure your SWING_API_KEY is properly set.");
        }

        if (res.status === 429) {
            if (attempt <= this.maxRetries) {
                const retryAfter = res.headers.get("Retry-After");
                const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
                console.warn(`[Swing] Rate limited (429). Retrying after ${waitMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                return retryFn();
            }
            throw new SwingRateLimitError("Swing API rate limit exceeded after maximum retries.");
        }

        if (!res.ok) {
            let body = "";
            try { body = await res.text(); } catch (e) { }
            throw new Error(`HTTP Request failed: ${res.status} ${res.statusText} - ${body}`);
        }

        return res.json();
    }

    async get(url: string, headers?: Record<string, string>, attempt = 1): Promise<any> {
        const res = await fetch(url, { method: "GET", headers });
        return this.handleResponse(res, () => this.get(url, headers, attempt + 1), attempt);
    }

    async post(url: string, body: any, headers?: Record<string, string>, attempt = 1): Promise<any> {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
        });
        return this.handleResponse(res, () => this.post(url, body, headers, attempt + 1), attempt);
    }
}

// ---------------------------------------------------------------------------
// SwingProtocol
// ---------------------------------------------------------------------------

export class SwingProtocol extends BaseProtocol {
    readonly name = "swing";
    readonly type: ProtocolType = "bridge";
    // Currently supported common chains (1 = ETH, 137 = Polygon, 42161 = Arbitrum)
    readonly supportedChains = [1, 137, 42161, 10, 8453];

    constructor(
        private readonly apiKey: string,
        private readonly httpClient: IHttpClient = new FetchHttpClient(),
        private readonly baseUrl = "https://swap.prod.swing.xyz/v0",
    ) {
        super();
    }

    private get headers() {
        return {
            "Accept": "application/json",
            "x-swing-api-key": this.apiKey,
        };
    }

    // -------------------------------------------------------------------------
    // getTokens (NEW — Phase D)
    // -------------------------------------------------------------------------

    /**
     * Fetch the list of tokens supported by Swing for a given chain.
     */
    async getTokens(chainId: number): Promise<SwingToken[]> {
        const url = `${this.baseUrl}/tokens?chain=${chainId}`;

        try {
            const data = await this.httpClient.get(url, this.headers);

            // Note: Swing often returns an array directly, but sometimes it might be `{ tokens: [] }`
            // Let's handle both dynamically
            const items = Array.isArray(data) ? data : data.tokens;

            if (!Array.isArray(items)) {
                throw new Error(`Invalid response format from Swing tokens API for chain ${chainId}`);
            }

            return items.map((t: any) => ({
                symbol: t.symbol,
                address: t.address,
                decimals: t.decimals,
                name: t.name,
                chainId: chainId,
            }));
        } catch (error) {
            if (error instanceof SwingAuthError || error instanceof SwingRateLimitError) {
                throw error;
            }
            throw new Error(`Failed to fetch tokens for chain ${chainId}: ${(error as Error).message}`);
        }
    }

    // -------------------------------------------------------------------------
    // quote
    // -------------------------------------------------------------------------

    /**
     * Get a cross-chain quote from Swing API.
     */
    async quote(params: QuoteParams): Promise<ProtocolQuote> {
        const url = new URL(`${this.baseUrl}/transfer/quote`);
        url.searchParams.append("fromChain", params.fromChain.toString());
        url.searchParams.append("toChain", params.toChain.toString());
        url.searchParams.append("fromToken", params.token);
        url.searchParams.append("toToken", params.token);
        url.searchParams.append("amount", params.amount.toString());

        const data = await this.httpClient.get(url.toString(), this.headers);

        // Validate response shape
        if (!data.routes || data.routes.length === 0) {
            throw new Error("No bridge routes found by Swing");
        }

        if (data.routes.length > 1) {
            console.info(`[SwingProtocol] ${data.routes.length} routes available, using best route`);
        }

        const route = data.routes[0];

        // Defensive: validate nested shape before accessing
        if (!route?.quote?.integration) {
            throw new Error("Swing API returned malformed route data (missing quote.integration)");
        }

        return {
            inputAmount: params.amount,
            outputAmount: BigInt(route.quote.integration.amountOut || "0"),
            fee: BigInt(route.quote.integration.fee || "0"),
            estimatedTimeMs: (route.quote.integration.estimatedTime || 0) * 1000,
            priceImpact: route.quote.integration.priceImpact || 0,
            protocolName: this.name,
        };
    }

    // -------------------------------------------------------------------------
    // buildTransaction
    // -------------------------------------------------------------------------

    /**
     * Build the raw transaction (calldata) for the quoted route.
     * Swing API typically returns the raw tx params we need to sign.
     */
    async buildTransaction(quote: ProtocolQuote, params: QuoteParams): Promise<Transaction[]> {
        const body = {
            fromChain: params.fromChain.toString(),
            toChain: params.toChain.toString(),
            fromToken: params.token,
            toToken: params.token,
            amount: params.amount.toString(),
            fromUserAddress: params.recipient || "0x", // Required by Swing to build calldata
            toUserAddress: params.recipient || "0x",
            route: [
                {
                    bridge: quote.protocolName, // Mock logic, usually from quote ID
                }
            ]
        };

        const data = await this.httpClient.post(`${this.baseUrl}/transfer/send`, body, this.headers);

        if (!data.tx) {
            throw new Error("Swing API did not return transaction data");
        }

        return [
            {
                to: data.tx.to,
                data: data.tx.data,
                value: data.tx.value || "0",
                chainId: params.fromChain,
                gasLimit: data.tx.gas || "3000000",
            }
        ];
    }

    // -------------------------------------------------------------------------
    // getTransferStatus
    // -------------------------------------------------------------------------

    /**
     * Get the status of an ongoing bridge transfer.
     */
    async getTransferStatus(transferId: string): Promise<"pending" | "done" | "failed"> {
        const data = await this.httpClient.get(`${this.baseUrl}/transfer/status/${transferId}`, this.headers);
        const statusStr = data.status?.toLowerCase();

        if (statusStr === "success" || statusStr === "done") return "done";
        if (statusStr === "failed" || statusStr === "error") return "failed";
        return "pending";
    }
}
