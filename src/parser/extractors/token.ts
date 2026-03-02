import type { TokenEntity } from "../../types";

interface NftCollection {
  name: string;
  aliases: string[];
}

// Static set of common English words to filter false positives
const COMMON_WORDS = new Set([
  "TO",
  "FROM",
  "WITH",
  "AND",
  "OR",
  "THE",
  "FOR",
  "OF",
  "IN",
  "ON",
  "AT",
  // Action words that should not be treated as token symbols
  "SWAP",
  "BUY",
  "SELL",
  "SEND",
  "BRIDGE",
  "CLAIM",
  "STAKE",
  "YIELD",
  "MAX",
  "MIN",
  // Domain-specific words that are not token symbols
  "NFT",
]);

/**
 * Token Extractor
 * Extracts token symbols and NFT collections from text
 */
export class TokenExtractor {
  private knownTokens: Record<string, string>;
  private knownCollections: NftCollection[];

  constructor(
    knownTokens: Record<string, string> = {},
    knownCollections?: NftCollection[],
  ) {
    this.knownTokens = { ...knownTokens };

    // Default NFT collections — can be overridden via constructor
    this.knownCollections = knownCollections ?? [
      { name: "Bored Ape Yacht Club", aliases: ["BAYC", "Bored Ape"] },
      { name: "Mutant Ape Yacht Club", aliases: ["MAYC", "Mutant Ape"] },
      { name: "CryptoPunks", aliases: ["Punks", "CryptoPunks"] },
      { name: "Azuki", aliases: ["Azuki"] },
      { name: "Doodles", aliases: ["Doodles"] },
      { name: "Clone X", aliases: ["CloneX", "Clone X"] },
      { name: "Moonbirds", aliases: ["Moonbirds"] },
      { name: "Pudgy Penguins", aliases: ["Pudgy Penguins", "Pudgy"] },
    ];
  }

  /**
   * Extract token entities from text
   *
   * INPUT: Text string
   * OUTPUT: Array of TokenEntity
   */
  extract(text: string): TokenEntity[] {
    const entities: TokenEntity[] = [];
    const matchedRanges: [number, number][] = [];

    // 1. Match NFT collections first (longer specific names take priority)
    const potentialMatches: TokenEntity[] = [];
    const uniqueKeys = new Set<string>();

    for (const collection of this.knownCollections) {
      for (const alias of [collection.name, ...collection.aliases]) {
        const pattern = new RegExp(`\\b${this.escapeRegExp(alias)}\\b`, "ig");
        let collectionMatch;

        while ((collectionMatch = pattern.exec(text)) !== null) {
          const start = collectionMatch.index;
          const end = start + collectionMatch[0].length;
          const key = `${start}-${end}`;

          if (uniqueKeys.has(key)) continue;
          uniqueKeys.add(key);

          potentialMatches.push({
            symbol: collection.name,
            rawText: collectionMatch[0],
            type: "collection",
            position: [start, end],
          });
        }
      }
    }

    // Filter out matches that are contained within other (longer) matches
    for (const match of potentialMatches) {
      const isContained = potentialMatches.some(
        (other) =>
          other !== match &&
          other.position![0] <= match.position![0] &&
          other.position![1] >= match.position![1] &&
          other.position![1] - other.position![0] >
          match.position![1] - match.position![0],
      );

      if (!isContained) {
        entities.push(match);
        matchedRanges.push(match.position as [number, number]);
      }
    }

    // 2. Match fungible token symbols
    const symbolPattern = /\b([A-Z]{2,10})\b/g;
    let match;

    while ((match = symbolPattern.exec(text)) !== null) {
      const symbol = match[1];
      const start = match.index;
      const end = start + match[0].length;

      // Skip common English words and action keywords
      if (COMMON_WORDS.has(symbol)) continue;

      // Skip if overlaps with already matched NFT
      const isOverlapping = matchedRanges.some(
        ([rStart, rEnd]) =>
          (start >= rStart && start < rEnd) || (end > rStart && end <= rEnd),
      );
      if (isOverlapping) continue;

      entities.push({
        symbol,
        rawText: match[0],
        type: "fungible",
        address: this.knownTokens[symbol],
        position: [start, end],
      });
      matchedRanges.push([start, end]);
    }

    // 3. Fuzzy matching (Optional/Future implementation)
    // TODO: Implement fuzzy matching for token symbols

    return entities;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
