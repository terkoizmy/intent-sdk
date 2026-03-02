/**
 * Token Enrichment Layer
 *
 * Bridges the gap between the IntentParser output (which has token symbols)
 * and the IntentSolver input (which needs contract addresses).
 *
 * Takes a parsed StructuredIntent and enriches it with resolved token addresses
 * from the TokenRegistry.
 *
 * Stage 3 — Live Integration
 *
 * USAGE:
 *   const registry = new TokenRegistry();
 *   registry.registerAll([...DEFAULT_TOKENS, ...TESTNET_TOKENS]);
 *
 *   const parsed = parser.parse("Bridge 100 USDC to Arbitrum");
 *   const enriched = enrichIntent(parsed, registry, 1, 42161);
 *   // enriched.parameters.inputTokenAddress  → "0xA0b86991..."
 *   // enriched.parameters.outputTokenAddress → "0xaf88d065..."
 */

import type { StructuredIntent } from "../../types/intent";
import type { ChainId } from "../../types/common";
import type { TokenRegistry } from "./registry";

/**
 * Result of intent enrichment
 */
export interface EnrichedIntent extends StructuredIntent {
    /** Whether token addresses were successfully resolved */
    enriched: boolean;

    /** Enrichment warnings (e.g., token not found, fallback used) */
    enrichmentWarnings: string[];
}

/**
 * Enrich a parsed intent with token contract addresses.
 *
 * Resolves `inputToken` symbol → `inputTokenAddress` on sourceChainId
 * Resolves `outputToken` symbol → `outputTokenAddress` on targetChainId
 *
 * If a token cannot be resolved, it adds a warning and leaves the address field empty.
 *
 * @param intent        - The parsed StructuredIntent from IntentParser
 * @param registry      - TokenRegistry instance with registered tokens
 * @param sourceChainId - Chain ID for the input token (source chain)
 * @param targetChainId - Chain ID for the output token (target chain), defaults to sourceChainId
 * @returns EnrichedIntent with resolved addresses
 */
export function enrichIntent(
    intent: StructuredIntent,
    registry: TokenRegistry,
    sourceChainId: ChainId,
    targetChainId?: ChainId,
): EnrichedIntent {
    const enrichedIntent: EnrichedIntent = {
        ...intent,
        parameters: { ...intent.parameters },
        enriched: false,
        enrichmentWarnings: [],
    };

    const actualTargetChainId = targetChainId ?? sourceChainId;
    let anySuccess = false;

    // Resolve input token
    if (enrichedIntent.parameters.inputToken) {
        const inputToken = registry.get(enrichedIntent.parameters.inputToken.toUpperCase(), sourceChainId);
        if (inputToken) {
            enrichedIntent.parameters.inputTokenAddress = inputToken.address;
            anySuccess = true;
        } else {
            enrichedIntent.enrichmentWarnings.push(
                `Failed to resolve input token ${enrichedIntent.parameters.inputToken} on chain ${sourceChainId}`
            );
        }
    }

    // Resolve output token
    if (enrichedIntent.parameters.outputToken) {
        const outputToken = registry.get(enrichedIntent.parameters.outputToken.toUpperCase(), actualTargetChainId);
        if (outputToken) {
            enrichedIntent.parameters.outputTokenAddress = outputToken.address;
            anySuccess = true;
        } else {
            enrichedIntent.enrichmentWarnings.push(
                `Failed to resolve output token ${enrichedIntent.parameters.outputToken} on chain ${actualTargetChainId}`
            );
        }
    }

    enrichedIntent.enriched = anySuccess;
    return enrichedIntent;
}
