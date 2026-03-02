/**
 * Normalize text for parsing
 *
 * INPUT: Raw text string
 * OUTPUT: Normalized text string
 *
 * TRANSFORMATIONS:
 * 1. Trim whitespace
 * 2. Convert to lowercase (for pattern matching)
 * 3. Remove extra spaces
 * 4. Normalize quotes
 * 5. Handle common abbreviations
 *
 * TODO: Implement normalization logic
 */
export function normalizeText(text: string): string {
  // TODO: Implement normalization

  return text
    .trim()
    .replace(/\s+/g, " ") // Multiple spaces -> single space
    .replace(/[\u201C\u201D]/g, '"') // Normalize curly double quotes
    .replace(/[\u2018\u2019]/g, "'"); // Normalize curly single quotes
}

/**
 * Normalize token symbol
 *
 * INPUT: Token string (case-insensitive)
 * OUTPUT: Uppercase token symbol
 *
 * EXAMPLES:
 * "usdc" -> "USDC"
 * "Eth" -> "ETH"
 */
export function normalizeTokenSymbol(token: string): string {
  return token.toUpperCase().trim();
}

/**
 * Parse amount with decimals
 *
 * INPUT: Amount and token symbol
 * OUTPUT: Amount in smallest unit (wei, smallest token unit)
 *
 * EXAMPLES:
 * (1000, "USDC") -> "1000000000" (USDC has 6 decimals)
 * (1, "ETH") -> "1000000000000000000" (ETH has 18 decimals)
 *
 * TODO: Implement decimal conversion
 */
export function parseAmountWithDecimals(amount: number, token: string): string {
  const decimals = getTokenDecimals(token);
  const multiplier = Math.pow(10, decimals);
  const result = Math.floor(amount * multiplier);
  return result.toString();
}

/**
 * Get token decimals
 *
 * TODO: Implement decimal lookup
 */
function getTokenDecimals(token: string): number {
  const decimalsMap: Record<string, number> = {
    USDC: 6,
    USDT: 6,
    DAI: 18,
    ETH: 18,
    WETH: 18,
    WBTC: 8,
  };

  return decimalsMap[token] || 18; // Default to 18
}
