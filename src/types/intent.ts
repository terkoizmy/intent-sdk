/**
 * Intent Types - Define all possible intent types
 */
export type IntentType =
  | "swap"
  | "yield_strategy"
  | "nft_purchase"
  | "send"
  | "bridge"
  | "claim"
  | "unknown";

/**
 * Risk Level for DeFi operations
 */
export type RiskLevel = "low" | "medium" | "high";

/**
 * Claim Type for reward/airdrop/vesting operations
 */
export type ClaimType = "airdrop" | "rewards" | "vesting";

/**
 * Base Structured Intent
 * This is what gets returned after parsing
 */
export interface StructuredIntent {
  // Type of intent
  intentType: IntentType;

  // Main parameters for execution
  parameters: IntentParameters;

  // Constraints and preferences
  constraints: IntentConstraints;

  // Metadata
  metadata: IntentMetadata;
}

/**
 * Intent Parameters - varies by intent type
 */
export interface IntentParameters {
  // Common fields
  inputToken?: string; // Token symbol (e.g., "USDC")
  inputTokenAddress?: string; // Token contract address
  inputAmount?: string; // Amount in smallest unit

  outputToken?: string;
  outputTokenAddress?: string;
  minOutputAmount?: string;

  recipient?: string; // Recipient address

  // Yield-specific
  riskLevel?: RiskLevel;
  diversificationRequired?: boolean;
  preferredProtocols?: string[];
  targetAPY?: string;

  // NFT-specific
  collection?: string;
  collectionAddress?: string;
  traits?: Record<string, string>;
  maxPrice?: string;

  // Bridge-specific
  sourceChain?: string;
  targetChain?: string;

  // Claim-specific
  claimType?: ClaimType;
  protocol?: string;

  // Additional flexible parameters
  [key: string]: any;
}

/**
 * Intent Constraints
 */
export interface IntentConstraints {
  deadline: number; // Unix timestamp
  maxSlippage?: number; // In basis points (100 = 1%)
  maxGasCost?: string; // Max gas willing to pay (in ETH)
  minProtocols?: number; // For diversification
  maxExposurePerProtocol?: number; // Max % in single protocol
  preferredDEXs?: string[];
  preferredMarketplaces?: string[];

  // Additional flexible constraints
  [key: string]: any;
}

/**
 * Intent Metadata
 */
export interface IntentMetadata {
  originalText: string; // Original user input
  confidence: number; // Parsing confidence (0-1)
  parsedAt: number; // Unix timestamp
  warnings?: string[]; // Any warnings during parsing
}
