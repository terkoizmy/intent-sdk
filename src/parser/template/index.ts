import type { IntentTemplate, IntentType } from "../../types";
import { swapTemplate } from "./swap";
import { yieldTemplate } from "./yield";
import { nftTemplate } from "./nft";
import { sendTemplate } from "./send";
import { bridgeTemplate } from "./bridge";
import { claimTemplate } from "./claim";
import { unknownTemplate } from "./unknown";

/**
 * Template Registry
 * Central registry for all intent templates
 */
export class TemplateRegistry {
  private templates: Map<IntentType, IntentTemplate>;

  constructor() {
    this.templates = new Map([
      ["swap", swapTemplate],
      ["yield_strategy", yieldTemplate],
      ["nft_purchase", nftTemplate],
      ["send", sendTemplate],
      ["bridge", bridgeTemplate],
      ["claim", claimTemplate],
      ["unknown", unknownTemplate],
    ]);
  }

  /**
   * Get template by intent type
   *
   * INPUT: IntentType
   * OUTPUT: IntentTemplate | undefined
   */
  get(intentType: IntentType): IntentTemplate | undefined {
    return this.templates.get(intentType);
  }

  /**
   * Register custom template
   *
   * INPUT: IntentTemplate
   * OUTPUT: void
   */
  register(template: IntentTemplate): void {
    this.templates.set(template.type, template);
  }

  /**
   * Check if template exists
   */
  has(intentType: IntentType): boolean {
    return this.templates.has(intentType);
  }
}
