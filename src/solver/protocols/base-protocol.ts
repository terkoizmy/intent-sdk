/**
 * Base Protocol — Phase I
 *
 * Abstract base class for all protocol integrations (Swing, Aave, etc.).
 * Provides uniform interface for the Rebalancer and other modules
 * to interact with heterogeneous protocols.
 */

import type { Transaction } from "../types/execution";

export type ProtocolType = "bridge" | "lending" | "dex";

export interface ProtocolQuote {
    inputAmount: bigint;
    outputAmount: bigint;
    fee: bigint;
    estimatedTimeMs: number;
    priceImpact?: number; // Basis points (100 = 1%)
    protocolName: string;
}

export interface QuoteParams {
    fromChain: number;
    toChain: number;
    token: string;
    amount: bigint;
    recipient?: string;
}

export abstract class BaseProtocol {
    abstract readonly name: string;
    abstract readonly type: ProtocolType;
    abstract readonly supportedChains: number[];

    /**
     * Check if the protocol supports a given chainId.
     */
    supports(chainId: number): boolean {
        return this.supportedChains.includes(chainId);
    }

    /**
     * Get a price/route quote. Implementation depends on protocol type.
     */
    abstract quote(params: QuoteParams): Promise<ProtocolQuote>;

    /**
     * Build one or more transactions to execute the quoted action.
     */
    abstract buildTransaction(quote: ProtocolQuote, params: QuoteParams): Promise<Transaction[]>;
}
