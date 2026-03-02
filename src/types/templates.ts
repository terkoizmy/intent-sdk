import type { IntentType, IntentParameters, IntentConstraints } from "./intent";

/**
 * Intent Template
 * Defines the structure for each intent type
 */
export interface IntentTemplate {
  type: IntentType;

  // Required fields that MUST be present
  requiredFields: (keyof IntentParameters)[];

  // Optional fields
  optionalFields: (keyof IntentParameters)[];

  // Default values for missing fields
  defaults: Partial<IntentParameters>;

  // Default constraints
  defaultConstraints: Partial<IntentConstraints>;

  // Validation function (optional)
  validate?: (params: IntentParameters) => boolean;
}

/**
 * Template Registry
 */
export type TemplateRegistry = Map<IntentType, IntentTemplate>;
