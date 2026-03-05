import type { IntentType } from "../../types";

/**
 * Intent Classifier
 * Determines the type of intent from natural language
 */
export class IntentClassifier {
  private patterns: Map<IntentType, RegExp[]>;

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Classify intent type from text
   *
   * INPUT: Normalized text string
   * OUTPUT: IntentType
   *
   * LOGIC:
   * 1. Check text against each pattern group
   * 2. Return first match
   * 3. Default to 'unknown' if no match
   */
  classify(text: string): IntentType {

    // Example structure:
    for (const [intentType, patterns] of this.patterns.entries()) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return intentType;
        }
      }
    }

    return "unknown";
  }

  /**
   * Initialize pattern matchers for each intent type
   *
   * OUTPUT: Map of IntentType to RegExp patterns
   */
  private initializePatterns(): Map<IntentType, RegExp[]> {

    return new Map<IntentType, RegExp[]>([
      ["swap", [/swap/i, /trade/i, /exchange/i, /convert/i]],
      [
        "yield_strategy",
        [/yield/i, /stake/i, /earn/i, /maximize/i, /apy/i, /farm/i],
      ],
      [
        "nft_purchase",
        [/buy.*nft/i, /purchase.*nft/i, /buy.*collection/i, /mint/i],
      ],
      [
        "claim",
        [/claim/i, /collect.*reward/i, /withdraw.*reward/i, /\bvest(?:ing|ed)?\b/i],
      ],
      // Bridge MUST be checked before send — "cross-chain transfer" must match bridge, not send
      ["bridge", [/bridge/i, /cross[\s-]?chain/i]],
      ["send", [/send/i, /transfer/i, /pay/i]],
    ]);
  }
}
