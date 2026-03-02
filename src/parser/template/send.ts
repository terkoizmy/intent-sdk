import type { IntentTemplate } from "../../types";

/**
 * Send Intent Template
 *
 * Handles sending/transferring tokens to a recipient address.
 *
 * USE CASES:
 * - "Send 0.5 ETH to 0x1234..."
 * - "Transfer 100 USDC to vitalik.eth"
 * - "Pay 50 DAI to 0xabcd..."
 *
 * REQUIRED FIELDS:
 * - inputToken: The token to send (e.g., "ETH", "USDC")
 * - inputAmount: How much to send (e.g., "0.5", "100")
 * - recipient: Destination address or ENS name (e.g., "0x1234...", "vitalik.eth")
 *
 * OPTIONAL FIELDS:
 * - maxGasCost: Maximum gas the user is willing to pay (e.g., "0.01")
 *
 * DEFAULT CONSTRAINTS:
 * - deadline: 0 (will be set dynamically by parser using config.defaultDeadlineOffset)
 */
export const sendTemplate: IntentTemplate = {
    type: "send",

    requiredFields: ["inputToken", "inputAmount", "recipient"],

    optionalFields: ["maxGasCost"],

    defaults: {
        maxGasCost: undefined,
    },

    defaultConstraints: {
        deadline: 0,
    },

    /**
     * Validate send parameters
     *
     * INPUT: IntentParameters object
     * OUTPUT: boolean — true if valid
     *
     * VALIDATION RULES:
     * - inputToken must be present
     * - inputAmount must be present and > 0
     * - recipient must be present and be a valid address (0x...) or ENS name (*.eth)
     */
    validate: (params) => {
        // 1. Check inputToken is present
        if (!params.inputToken) return false;

        // 2. Check inputAmount is present and not "0"
        if (!params.inputAmount || params.inputAmount === "0") return false;

        // 3. Check recipient is present
        if (!params.recipient) return false;

        // 4. Validate recipient format (basic check)
        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(params.recipient);
        const isENS = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.eth$/.test(params.recipient);

        if (!isAddress && !isENS) return false;

        return true;
    },
};
