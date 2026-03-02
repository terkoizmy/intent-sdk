import type { AmountEntity } from "../../types";

/**
 * Amount Extractor
 * Extracts numerical amounts from text
 */
export class AmountExtractor {
  private patterns: RegExp[];

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Extract all amount entities from text
   *
   * INPUT: Text string
   * OUTPUT: Array of AmountEntity
   *
   * EXAMPLES:
   * "1000 USDC" -> [{ value: 1000, rawText: "1000", unit: "USDC" }]
   * "10k ETH" -> [{ value: 10000, rawText: "10k", unit: "ETH" }]
   * "0.5 BTC" -> [{ value: 0.5, rawText: "0.5", unit: "BTC" }]
   *
   * TODO:
   * 1. Match patterns for amounts
   * 2. Parse numeric value (handle k, m suffixes)
   * 3. Extract optional unit (token symbol)
   * 4. Return array of AmountEntity
   */
  extract(text: string): AmountEntity[] {
    const rawEntities: AmountEntity[] = [];

    // Collect all potential matches
    for (const pattern of this.patterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rawText = match[0];
        const groups = match.groups || {};
        const numericPart = groups.value;
        const suffix = groups.suffix || "";
        const unit = groups.unit || undefined;

        if (!numericPart) continue;

        rawEntities.push({
          value: this.parseNumericValue(numericPart, suffix),
          rawText,
          unit,
          position: [match.index, match.index + rawText.length],
        });
      }
    }

    // Sort by length (descending) to prefer longer matches (e.g. "1000 USDC" over "1000")
    // If lengths are equal, prefer earlier position
    rawEntities.sort((a, b) => {
      const lenDiff = (b.position[1] - b.position[0]) - (a.position[1] - a.position[0]);
      if (lenDiff !== 0) return lenDiff;
      return a.position[0] - b.position[0];
    });

    // Filter overlaps
    const entities: AmountEntity[] = [];
    const occupiedmask = new Array(text.length).fill(false);

    for (const entity of rawEntities) {
      const [start, end] = entity.position;

      // Check for overlap
      let isOverlap = false;
      for (let i = start; i < end; i++) {
        if (occupiedmask[i]) {
          isOverlap = true;
          break;
        }
      }

      if (!isOverlap) {
        entities.push(entity);
        // Mark positions as occupied
        for (let i = start; i < end; i++) {
          occupiedmask[i] = true;
        }
      }
    }

    // Sort valid entities by position
    return entities.sort((a, b) => a.position[0] - b.position[0]);
  }

  /**
   * Parse numeric value with k/m suffixes
   *
   * INPUT: Value string and suffix string
   * OUTPUT: Numeric value
   */
  private parseNumericValue(value: string, suffix: string): number {
    const num = parseFloat(value);
    const lowerSuffix = suffix.toLowerCase();

    if (lowerSuffix === "k") {
      return num * 1000;
    } else if (lowerSuffix === "m") {
      return num * 1000000;
    }

    return num;
  }

  /**
   * Initialize regex patterns for amount matching
   */
  private initializePatterns(): RegExp[] {
    return [
      // Match: "1000 USDC", "10k ETH", "0.5 BTC", "1.5m DAI"
      /(?<value>\d+(?:\.\d+)?)\s*(?<suffix>[km]?)\s*(?<unit>[A-Z]{2,10})/g,

      // Match: "10k", "1.5m" (without unit)
      /(?<value>\d+(?:\.\d+)?)\s*(?<suffix>[km])/gi,

      // Match: plain numbers "1000", "0.5"
      /\b(?<value>\d+(?:\.\d+)?)\b/g,
    ];
  }
}
