import type { IntentTemplate } from "../../types";

export const nftTemplate: IntentTemplate = {
  type: "nft_purchase",

  requiredFields: ["collection"],

  optionalFields: ["traits", "maxPrice", "recipient"],

  defaults: {
    traits: {},
    recipient: undefined,
  },

  defaultConstraints: {
    deadline: 0,
    preferredMarketplaces: ["opensea", "blur"],
  },

  validate: (params) => {
    if (!params.collection) return false;
    return true;
  },
};
