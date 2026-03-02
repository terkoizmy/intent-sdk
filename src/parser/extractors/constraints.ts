import type { ConstraintEntity } from "../../types";

/**
 * Constraint Extractor
 * Extracts constraints like slippage, deadline, gas limits
 */
export class ConstraintExtractor {
  /**
   * Extract constraint entities from text
   *
   * INPUT: Text string
   * OUTPUT: Array of ConstraintEntity
   *
   * EXAMPLES:
   * "max 1% slippage" -> [{ type: "slippage", value: 100, rawText: "max 1% slippage" }]
   * "within 1 hour" -> [{ type: "deadline", value: 3600, rawText: "within 1 hour" }]
   *
   * EXTRACTS:
   * 1. Slippage constraints (%, basis points)
   * 2. Deadline constraints (time expressions)
   * 3. Gas constraints
   * 4. Price constraints
   */
  extract(text: string): ConstraintEntity[] {
    const entities: ConstraintEntity[] = [];

    // Extract slippage
    const slippageMatch = text.match(
      /(?:max|maximum)?\s*(\d+(?:\.\d+)?)\s*%?\s*slippage/i,
    );
    if (slippageMatch) {
      const percentage = parseFloat(slippageMatch[1]);
      entities.push({
        type: "slippage",
        value: percentage * 100, // Convert to basis points
        rawText: slippageMatch[0],
        position: [
          slippageMatch.index!,
          slippageMatch.index! + slippageMatch[0].length,
        ],
      });
    }

    // Extract deadline
    const deadlineMatch = text.match(/(?:within|in)\s+(\d+)\s*(hour|hr|minute|min|day|second|sec)s?/i);
    if (deadlineMatch) {
      const seconds = this.parseTimeExpression(deadlineMatch[0]);
      entities.push({
        type: "deadline",
        value: seconds,
        rawText: deadlineMatch[0],
        position: [
          deadlineMatch.index!,
          deadlineMatch.index! + deadlineMatch[0].length,
        ],
      });
    }

    // Extract gas limit (requires 'gas' keyword nearby)
    const gasMatch = text.match(/(?:gas\s*(?:limit|cost|fee|under|max)|(?:max|under)\s*(?:\d+(?:\.\d+)?)\s*(?:ETH|gwei)\s*gas)\s*(\d+(?:\.\d+)?)\s*(ETH|gwei)/i)
      || text.match(/gas\s*(?:limit|cost|fee)?\s*(?:under|max|of)?\s*(\d+(?:\.\d+)?)\s*(ETH|gwei)/i);
    if (gasMatch) {
      let value = parseFloat(gasMatch[1]);
      const unit = gasMatch[2].toLowerCase();

      // Convert gwei to ETH
      if (unit === 'gwei') {
        value = value * 1e-9;
      }

      entities.push({
        type: "gas",
        value: value,
        rawText: gasMatch[0],
        position: [
          gasMatch.index!,
          gasMatch.index! + gasMatch[0].length,
        ],
      });
    }

    // Extract price constraints (excludes time words like 'minutes', 'hours')
    const priceMatch = text.match(/(?:max\s*price|under|below|no\s*more\s*than)\s*(\d+(?:\.\d+)?)\s*(?!(?:second|sec|minute|min|hour|hr|day)s?\b)([A-Z]{2,10})/i);
    if (priceMatch) {
      const value = parseFloat(priceMatch[1]);
      entities.push({
        type: "price",
        value: value,
        rawText: priceMatch[0],
        position: [
          priceMatch.index!,
          priceMatch.index! + priceMatch[0].length,
        ],
      });
    }

    return entities;
  }

  /**
   * Parse time expression to seconds
   *
   * INPUT: Time string like "1 hour", "30 minutes", "1 day"
   * OUTPUT: Seconds
   *
   * EXAMPLES:
   * "1 hour" -> 3600
   * "30 minutes" -> 1800
   * "1 day" -> 86400
   */
  private parseTimeExpression(timeStr: string): number {

    const secondMatch = timeStr.match(/(\d+)\s*(?:second|sec)/i);
    if (secondMatch) {
      return parseInt(secondMatch[1]);
    }

    const minuteMatch = timeStr.match(/(\d+)\s*(?:minute|min)/i);
    if (minuteMatch) {
      return parseInt(minuteMatch[1]) * 60;
    }

    const hourMatch = timeStr.match(/(\d+)\s*(?:hour|hr)/i);
    if (hourMatch) {
      return parseInt(hourMatch[1]) * 3600;
    }

    const dayMatch = timeStr.match(/(\d+)\s*day/i);
    if (dayMatch) {
      return parseInt(dayMatch[1]) * 86400;
    }

    return 3600; // Default 1 hour
  }
}
