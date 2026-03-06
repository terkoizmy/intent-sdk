/**
 * Intent Parser SDK — Main Entry Point
 *
 * @packageDocumentation
 * @module @terkoizmy/intent-sdk
 *
 * Usage:
 *   import { IntentParser, IntentSolver, createIntentSDK } from "@terkoizmy/intent-sdk";
 *
 *   // Parser only
 *   const parser = new IntentParser();
 *   const result = parser.parse("Bridge 100 USDC from Ethereum to Arbitrum");
 *
 *   // Full SDK (parser + solver)
 *   const { parser, solver } = createIntentSDK(config);
 */

// ─── Core Classes ───────────────────────────────
export { createIntentSDK } from "./sdk-factory";
export { IntentParser } from "./parser";
export { IntentSolver } from "./solver";


// ─── Parser Types ───────────────────────────────
export type { ParseResult, ParserConfig } from "./types";
export type { IntentType, StructuredIntent, IntentParameters, IntentConstraints, IntentMetadata } from "./types/intent";

// ─── Solver Types ───────────────────────────────
export type { AgentConfig, SolutionResult, AgentStatus } from "./solver/types/agent";
export type { SolverIntent, BridgeIntent } from "./solver/types/intent";
export type { PricingResult, PricingConfig } from "./solver/types/pricing";
export type { Settlement, SettlementStatus, CrossChainProof } from "./solver/types/settlement";
export type { InventoryBalance, InventorySnapshot } from "./solver/types/inventory";

// ─── Shared Types ───────────────────────────────
export type { Address, ChainId, Hash, Amount } from "./types/common";
export type { ChainConfig } from "./types/chain";

// ─── Error Classes ──────────────────────────────
export {
  SolverError,
  InsufficientInventoryError,
  IntentExpiredError,
  UnsupportedIntentError,
} from "./errors/solver-errors";
export {
  SettlementError,
  ProofGenerationError,
  ClaimFailedError,
} from "./errors/settlement-errors";

// ─── Utilities ──────────────────────────────────
export { withRetry, isTransientNetworkError } from "./shared/utils/retry";
export type { RetryOptions } from "./shared/utils/retry";
export { getChainDisplayName, CHAIN_NAMES } from "./shared/chain-registry/chain-names";
