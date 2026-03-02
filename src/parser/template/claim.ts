import type { IntentTemplate } from "../../types";

/**
 * Claim Intent Template
 *
 * Handles claiming rewards, airdrops, and vested tokens.
 *
 * USE CASES:
 * - "Claim my AERO airdrop"
 * - "Claim staking rewards from ETH"
 * - "Claim 500 vested ARB tokens"
 * - "Collect my UNI rewards"
 * - "Withdraw vested EIGEN tokens"
 */
export const claimTemplate: IntentTemplate = {
    type: "claim",

    // Only the token being claimed is strictly required —
    // amount and protocol can often be inferred on-chain
    requiredFields: ["inputToken"],

    optionalFields: ["inputAmount", "claimType", "protocol"],

    defaults: {
        claimType: "rewards",
    },

    defaultConstraints: {
        deadline: 0, // Will be set dynamically by parser
    },

    validate: (params) => {
        if (!params.inputToken) return false;
        // claimType must be one of the known types if provided
        if (
            params.claimType &&
            !["airdrop", "rewards", "vesting"].includes(params.claimType)
        ) {
            return false;
        }
        return true;
    },
};
