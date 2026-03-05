import { z } from "zod";
import type { StructuredIntent } from "../../types";

/**
 * Zod schemas for validation
 */
const IntentParametersSchema = z
  .object({
    inputToken: z.string().optional(),
    inputTokenAddress: z.string().optional(),
    inputAmount: z.string().optional(),
    outputToken: z.string().optional(),
    outputTokenAddress: z.string().optional(),
    minOutputAmount: z.string().optional(),
    recipient: z.string().optional(),
    riskLevel: z.enum(["low", "medium", "high"]).optional(),
    diversificationRequired: z.boolean().optional(),
    preferredProtocols: z.array(z.string()).optional(),
    targetAPY: z.string().optional(),
    collection: z.string().optional(),
    collectionAddress: z.string().optional(),
    traits: z.record(z.string(), z.string()).optional(),
    maxPrice: z.string().optional(),
  })
  .passthrough();

const IntentConstraintsSchema = z
  .object({
    deadline: z.number(),
    maxSlippage: z.number().optional(),
    maxGasCost: z.string().optional(),
    minProtocols: z.number().optional(),
    maxExposurePerProtocol: z.number().optional(),
    preferredDEXs: z.array(z.string()).optional(),
    preferredMarketplaces: z.array(z.string()).optional(),
  })
  .passthrough();

const StructuredIntentSchema = z.object({
  intentType: z.enum([
    "swap",
    "yield_strategy",
    "nft_purchase",
    "send",
    "bridge",
    "claim",
    "unknown",
  ]),
  parameters: IntentParametersSchema,
  constraints: IntentConstraintsSchema,
  metadata: z.object({
    originalText: z.string(),
    confidence: z.number().min(0).max(1),
    parsedAt: z.number(),
    warnings: z.array(z.string()).optional(),
  }),
});

/**
 * Validate structured intent against Zod schema
 *
 * INPUT: StructuredIntent
 * OUTPUT: { success: boolean, error?: string }
 */
export function validateIntent(intent: StructuredIntent): {
  success: boolean;
  error?: string;
} {
  try {
    StructuredIntentSchema.parse(intent);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((e: z.ZodIssue) => e.message).join(", "),
      };
    }
    return {
      success: false,
      error: "Unknown validation error",
    };
  }
}
