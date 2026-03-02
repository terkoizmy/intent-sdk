import type { IntentTemplate } from "../../types";

/**
 * Bridge Intent Template
 *
 * Handles cross-chain token bridging between different blockchains.
 *
 * USE CASES:
 * - "Bridge 100 USDC from Ethereum to Polygon"
 * - "Move 0.5 ETH to Arbitrum"
 * - "Cross-chain transfer 1000 DAI from mainnet to Optimism"
 *
 * REQUIRED FIELDS:
 * - inputToken: The token to bridge (e.g., "USDC", "ETH")
 * - inputAmount: How much to bridge (e.g., "100", "0.5")
 * - sourceChain: Origin chain (e.g., "Ethereum", "Polygon")
 * - targetChain: Destination chain (e.g., "Arbitrum", "Optimism")
 *
 * OPTIONAL FIELDS:
 * - outputToken: Target token if different from input (e.g., bridge USDC, receive USDC.e)
 * - maxSlippage: Maximum acceptable slippage in basis points (100 = 1%)
 *
 * DEFAULT CONSTRAINTS:
 * - deadline: 0 (will be set dynamically)
 * - maxSlippage: 100 (1%)
 *
 * KNOWN CHAINS (for reference):
 * - "Ethereum" / "mainnet"
 * - "Polygon"
 * - "Arbitrum"
 * - "Optimism"
 * - "Base"
 * - "Avalanche"
 * - "BSC" / "BNB Chain"
 * - "Solana"
 */
export const bridgeTemplate: IntentTemplate = {
    type: "bridge",

    requiredFields: ["inputToken", "inputAmount", "sourceChain", "targetChain"],

    optionalFields: ["outputToken", "maxSlippage"],

    defaults: {
        maxSlippage: 100, // 1%
        outputToken: undefined,
    },

    defaultConstraints: {
        deadline: 0,
        maxSlippage: 100,
    },

    /**
     * Validate bridge parameters
     *
     * INPUT: IntentParameters object
     * OUTPUT: boolean — true if valid
     *
     * VALIDATION RULES:
     * - inputToken must be present
     * - inputAmount must be present and > 0
     * - sourceChain must be present
     * - targetChain must be present
     * - sourceChain and targetChain must be different
     */
    validate: (params) => {
        // 1. Check inputToken is present
        if (!params.inputToken) return false;

        // 2. Check inputAmount is present and not "0"
        if (!params.inputAmount || params.inputAmount === "0") return false;

        // 3. Check sourceChain is present
        if (!params.sourceChain) return false;

        // 4. Check targetChain is present
        if (!params.targetChain) return false;

        // 5. Verify sourceChain !== targetChain
        if (params.sourceChain.toLowerCase() === params.targetChain.toLowerCase()) {
            return false;
        }

        return true;
    },
};
