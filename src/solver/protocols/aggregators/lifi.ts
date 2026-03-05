/**
 * Li.Fi Protocol Integration — Phase D (Live Integration)
 *
 * DEX/Bridge aggregator integration using Li.Fi API (https://li.quest/v1/)
 * Provides quoting and transaction building for cross-chain inventory rebalancing
 * WITHOUT requiring an API Key.
 */

import { BaseProtocol, type ProtocolQuote, type QuoteParams } from "../base-protocol";
import type { Transaction, ExecutionResult } from "../../types/execution";
import type { IBridgeProtocol } from "../../inventory/rebalancer";
import { type IHttpClient, FetchHttpClient } from "./swing"; // Reusing the HTTP Client

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiFiQuoteRequest {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    toAddress?: string;
    slippage?: string;
}

export interface LiFiToken {
    symbol: string;
    address: string;
    decimals: number;
    chainId: number;
    name?: string;
    logoURI?: string;
    priceUSD?: string;
}

export interface LiFiQuoteResponse {
    type: string;
    id: string;
    tool: string;
    action: {
        fromChainId: number;
        toChainId: number;
        fromToken: LiFiToken;
        toToken: LiFiToken;
        fromAmount: string;
        slippage: number;
    };
    estimate: {
        tool: string;
        approvalAddress: string;
        toAmount: string;
        toAmountMin: string;
        fromAmountUSD: string;
        toAmountUSD: string;
        executionDuration: number;
        feeCosts: Array<{
            name: string;
            description: string;
            amount: string;
            amountUSD: string;
            token: LiFiToken;
        }>;
        gasCosts: Array<{
            type: string;
            amount: string;
            amountUSD: string;
            estimate: string;
            limit: string;
            token: LiFiToken;
        }>;
    };
    transactionRequest?: {
        data: string;
        to: string;
        value: string;
        from: string;
        chainId: number;
        gasLimit: string;
        gasPrice: string;
    };
}

// ---------------------------------------------------------------------------
// LiFiProtocol
// ---------------------------------------------------------------------------

export class LiFiProtocol extends BaseProtocol implements IBridgeProtocol {
    readonly name = "Li.Fi";
    readonly type = "bridge";
    readonly supportedChains = [1, 10, 56, 137, 42161, 43114]; // Common EVM chains

    private readonly baseUrl = "https://li.quest/v1";
    private readonly httpClient: IHttpClient;
    private readonly defaultHeaders: Record<string, string>;

    constructor(
        httpClient?: IHttpClient,
    ) {
        super();
        this.httpClient = httpClient || new FetchHttpClient(2);
        this.defaultHeaders = {
            "Accept": "application/json",
            "x-lifi-integrator": "intent-parser-sdk" // Good practice to identify traffic
        };
    }

    /**
     * Get a cross-chain quote using Li.Fi API.
     * 
     * Li.Fi REQUIRES `fromAddress` even for a simple quote.
     */
    async quote(params: QuoteParams & { slippagePercent?: number, fromAddress?: string }): Promise<ProtocolQuote & { rawResponse?: any }> {
        const url = new URL(`${this.baseUrl}/quote`);
        url.searchParams.append("fromChain", params.fromChain.toString());
        url.searchParams.append("toChain", params.toChain.toString());
        url.searchParams.append("fromToken", params.token);
        url.searchParams.append("toToken", params.token);
        url.searchParams.append("fromAmount", params.amount.toString());

        // Slippage is 0.03 = 3% by default in LiFi, we can pass it as decimal
        if (params.slippagePercent !== undefined) {
            url.searchParams.append("slippage", (params.slippagePercent / 100).toString());
        }

        // Li.Fi requires a fromAddress. If none provided, use a dummy active address (Vitalik's) to get an estimate
        const fromAddress = params.fromAddress || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
        url.searchParams.append("fromAddress", fromAddress);

        let data: LiFiQuoteResponse;
        try {
            data = await this.httpClient.get(url.toString(), this.defaultHeaders) as LiFiQuoteResponse;
        } catch (error: unknown) {
            throw new Error(`Li.Fi API Error: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Extract total fees (gas + protocol fees) in smallest unit of the toToken
        // For simplicity in this SDK phase, we sum them up if they exist, but usually they are paid in native gas
        let totalFeeStr = "0";
        if (data.estimate.feeCosts && data.estimate.feeCosts.length > 0) {
            totalFeeStr = data.estimate.feeCosts.reduce((acc, curr) => {
                return (BigInt(acc) + BigInt(curr.amount)).toString();
            }, "0");
        }

        return {
            inputAmount: params.amount,
            outputAmount: BigInt(data.estimate.toAmount),
            fee: BigInt(totalFeeStr), // This is an approximation
            estimatedTimeMs: data.estimate.executionDuration * 1000,
            priceImpact: 0, // Not explicitly provided as a single field
            protocolName: this.name,
            // Store the raw transaction request so buildTransaction can use it
            rawResponse: data.transactionRequest
        };
    }

    /**
     * Build the raw transaction data for execution.
     * Li.Fi already provides the `transactionRequest` inside the `/quote` response
     * if `fromAddress` was provided. So we can just extract it.
     */
    async buildTransaction(quote: ProtocolQuote & { rawResponse?: any }, params: QuoteParams & { fromAddress?: string }): Promise<Transaction[]> {
        // We call quote again but guarantee fromAddress is passed if not already present
        let finalQuote = quote;
        if (!finalQuote.rawResponse) {
            if (!params.fromAddress) {
                throw new Error("Li.Fi did not return transaction data. Ensure fromAddress is provided.");
            }
            finalQuote = await this.quote(params as any);
            if (!finalQuote.rawResponse) {
                throw new Error("Li.Fi did not return transaction data even after retry.");
            }
        }

        const txRequest = finalQuote.rawResponse as NonNullable<LiFiQuoteResponse['transactionRequest']>;

        return [{
            to: txRequest.to as `0x${string}`,
            data: txRequest.data as `0x${string}`,
            value: BigInt(txRequest.value).toString(),
            chainId: txRequest.chainId,
            gasLimit: BigInt(txRequest.gasLimit || "500000").toString(),
        }];
    }

    /**
     * Implementing IBridgeProtocol for Rebalancer.
     * Note: Rebalancer uses slightly different signatures than BaseProtocol.
     */
    async bridge(params: {
        fromChain: number;
        toChain: number;
        token: string;
        amount: bigint;
        recipient: string;
    }): Promise<ExecutionResult> {
        return {
            success: false,
            error: "Bridge execution should be done via wallet manager in LiquidityAgent, not directly in protocol class."
        };
    }
}
