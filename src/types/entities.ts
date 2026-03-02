/**
 * Extracted entities from natural language
 */
export interface ExtractedEntities {
  // Amount entities
  amounts: AmountEntity[];

  // Token entities
  tokens: TokenEntity[];

  // Action entities
  actions: ActionEntity[];

  // Constraint entities
  constraints: ConstraintEntity[];

  // Risk indicators
  riskIndicators: RiskIndicator[];
}

/**
 * Amount Entity
 * Example: "10k USDC" -> { value: 10000, rawText: "10k", unit: "USDC" }
 */
export interface AmountEntity {
  value: number; // Normalized value (10k -> 10000)
  rawText: string; // Original text ("10k")
  unit?: string; // Token symbol if present
  position: [number, number]; // Start and end position in text
}

/**
 * Token Entity
 * Example: "USDC", "ETH", "Bored Ape"
 */
export interface TokenEntity {
  symbol: string; // Token symbol (uppercase)
  rawText: string; // Original text
  type: "fungible" | "nft" | "collection";
  address?: string; // Contract address if known
  position: [number, number];
}

/**
 * Action Entity
 * Example: "swap", "maximize", "buy"
 */
export interface ActionEntity {
  action: string; // Normalized action (infinitive form)
  rawText: string; // Original text
  category: "trade" | "yield" | "purchase" | "transfer" | "other";
  position: [number, number];
}

/**
 * Constraint Entity
 * Example: "max 1% slippage", "deadline in 1 hour"
 */
export interface ConstraintEntity {
  type: "slippage" | "deadline" | "gas" | "price" | "other";
  value: string | number;
  rawText: string;
  position: [number, number];
}

/**
 * Risk Indicator
 * Example: "safe", "risky", "conservative"
 */
export interface RiskIndicator {
  level: "low" | "medium" | "high";
  keywords: string[]; // Keywords that triggered this
  confidence: number; // 0-1
}
