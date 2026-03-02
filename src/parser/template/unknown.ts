import type { IntentTemplate } from "../../types";

export const unknownTemplate: IntentTemplate = {
    type: "unknown",

    requiredFields: [],

    optionalFields: [],

    defaults: {},

    defaultConstraints: {
        deadline: 0,
    },

    validate: () => true,
};
