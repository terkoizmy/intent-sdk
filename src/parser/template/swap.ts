import type { IntentTemplate } from "../../types";

export const swapTemplate: IntentTemplate = {
  type: "swap",

  requiredFields: ["inputToken", "outputToken", "inputAmount"],

  optionalFields: ["minOutputAmount", "recipient", "maxSlippage"],

  defaults: {
    maxSlippage: 100, // 1% default
    recipient: undefined, // Will be set to user address
  },

  defaultConstraints: {
    deadline: 0, // Will be set dynamically
    maxSlippage: 100,
  },

  validate: (params) => {
    if (!params.inputToken || !params.outputToken) return false;
    if (!params.inputAmount || params.inputAmount === "0") return false;
    return true;
  },
};
