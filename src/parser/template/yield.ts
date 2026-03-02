import type { IntentTemplate } from "../../types";

export const yieldTemplate: IntentTemplate = {
  type: "yield_strategy",

  requiredFields: ["inputToken", "inputAmount"],

  optionalFields: [
    "riskLevel",
    "diversificationRequired",
    "preferredProtocols",
    "targetAPY",
  ],

  defaults: {
    riskLevel: "medium",
    diversificationRequired: false,
    preferredProtocols: [],
  },

  defaultConstraints: {
    deadline: 0,
    minProtocols: 1,
  },

  validate: (params) => {
    if (!params.inputToken || !params.inputAmount) return false;
    return true;
  },
};
