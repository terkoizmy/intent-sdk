import type { ActionEntity } from "../../types";

/**
 * Action Extractor
 * Extracts action verbs from text
 */
export class ActionExtractor {
  private actionMap: Map<
    string,
    { normalized: string; category: ActionEntity["category"] }
  >;

  constructor() {
    this.actionMap = this.initializeActionMap();
  }

  /**
   * Extract action entities from text
   *
   * INPUT: Text string
   * OUTPUT: Array of ActionEntity
   *
   * EXAMPLES:
   * "Swap USDC to ETH" -> [{ action: "swap", category: "trade" }]
   * "Maximize my yield" -> [{ action: "maximize", category: "yield" }]
   *
   * STEPS:
   * 1. Match action verbs (swap, send, buy, etc.)
   * 2. Normalize to infinitive form
   * 3. Categorize action type
   * 4. Return array of ActionEntity
   */
  extract(text: string): ActionEntity[] {
    const entities: ActionEntity[] = [];

    const lowerText = text.toLowerCase();

    for (const [pattern, metadata] of this.actionMap.entries()) {
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      let match;

      while ((match = regex.exec(lowerText)) !== null) {
        entities.push({
          action: metadata.normalized,
          rawText: match[0],
          category: metadata.category,
          position: [match.index, match.index + match[0].length],
        });
      }
    }

    return entities;
  }

  /**
   * Initialize action mapping
   * Maps various forms to normalized action + category
   */
  private initializeActionMap() {
    return new Map([
      // Trade actions
      ["swap", { normalized: "swap", category: "trade" as const }],
      ["swapping", { normalized: "swap", category: "trade" as const }],
      ["trade", { normalized: "trade", category: "trade" as const }],
      ["exchange", { normalized: "exchange", category: "trade" as const }],
      ["convert", { normalized: "convert", category: "trade" as const }],

      // Yield actions
      ["maximize", { normalized: "maximize", category: "yield" as const }],
      ["earn", { normalized: "earn", category: "yield" as const }],
      ["stake", { normalized: "stake", category: "yield" as const }],
      ["farm", { normalized: "farm", category: "yield" as const }],

      // Purchase actions
      ["buy", { normalized: "buy", category: "purchase" as const }],
      ["purchase", { normalized: "purchase", category: "purchase" as const }],
      ["mint", { normalized: "mint", category: "purchase" as const }],

      // Transfer actions
      ["send", { normalized: "send", category: "transfer" as const }],
      ["transfer", { normalized: "transfer", category: "transfer" as const }],
      ["pay", { normalized: "pay", category: "transfer" as const }],
    ]);
  }
}
