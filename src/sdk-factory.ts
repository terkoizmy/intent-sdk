/**
 * SDK Factory — Convenience function to create Parser + Solver
 *
 * Usage:
 *   import { createIntentSDK } from "@terkoizmy/intent-sdk";
 *
 *   const { parser, solver } = createIntentSDK({
 *       agent: {
 *           privateKey: "0x...",
 *           mode: "simulate",
 *           supportedChains: [1, 42161],
 *           supportedTokens: ["USDC"],
 *       },
 *       contractAddress: "0x...",
 *   });
 */

import { IntentParser } from "./parser";
import { IntentSolver } from "./solver";
import type { LiquidityAgentConfig } from "./solver/agent/agent-config";
import type { ParserConfig } from "./parser";

export interface SDKConfig {
    /** Parser configuration (optional — sensible defaults used) */
    parser?: ParserConfig;

    /** Solver configuration (required for solver functionality) */
    solver: LiquidityAgentConfig;
}

/**
 * Create a fully configured Intent SDK with both parser and solver.
 *
 * @param config - SDK configuration
 * @returns Object containing `parser` and `solver` instances
 *
 * @example
 * ```typescript
 * const { parser, solver } = createIntentSDK({
 *     solver: {
 *         agent: {
 *             privateKey: process.env.SOLVER_PRIVATE_KEY!,
 *             mode: "live",
 *             supportedChains: [1, 42161],
 *             supportedTokens: ["USDC"],
 *         },
 *         contractAddress: process.env.SETTLEMENT_CONTRACT!,
 *     },
 * });
 *
 * await solver.initialize();
 * const parsed = parser.parse("Bridge 100 USDC from Ethereum to Arbitrum");
 * ```
 */
export function createIntentSDK(config: SDKConfig) {
    return {
        parser: new IntentParser(config.parser),
        solver: new IntentSolver(config.solver),
    };
}
