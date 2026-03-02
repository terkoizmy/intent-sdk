/**
 * Pricing Types
 *
 * Types untuk fee calculation dan dynamic pricing engine.
 * Fee = baseFee + gasCost + slippageCapture
 */

/**
 * Pricing Result
 *
 * Full fee breakdown dari pricing engine.
 * Semua amount dalam token's smallest unit (e.g., 6 decimals for USDC).
 *
 * CONTOH untuk 1000 USDC bridge:
 *   {
 *     baseFee: "5000000",            // 5 USDC (0.5%)
 *     gasCost: "500000",             // 0.5 USDC
 *     slippageCapture: "2500000",    // 2.5 USDC (50% of user's max slippage)
 *     totalFee: "8000000",           // 8 USDC total
 *     userPays: "1000000000",        // 1000 USDC
 *     userReceives: "992000000",     // 992 USDC
 *     solverProfit: "7500000",       // 7.5 USDC (totalFee - gasCost)
 *   }
 */
export interface PricingResult {
    /** Base fee (amount * baseFeePercent) */
    baseFee: string;

    /** Estimated gas cost in token equivalent (USDC) */
    gasCost: string;

    /** Slippage capture from user's max slippage tolerance */
    slippageCapture: string;

    /** Total fee = baseFee + gasCost + slippageCapture */
    totalFee: string;

    /** Total amount user pays (including fees locked in contract) */
    userPays: string;

    /** Amount user actually receives on target chain */
    userReceives: string;

    /** Net solver profit = totalFee - gasCost */
    solverProfit: string;
}

/**
 * Pricing Configuration
 *
 * DEFAULTS:
 *   baseFeePercent: 0.005 (0.5%)
 *   minFeeUSD: 1
 *   maxFeePercent: 0.03 (3%)
 *   slippageSharePercent: 0.5 (50% of user's max slippage)
 */
export interface PricingConfig {
    /** Base fee as percentage of amount (0.005 = 0.5%) */
    baseFeePercent: number;

    /** Minimum fee in USD — enforce even for small amounts */
    minFeeUSD: number;

    /** Maximum fee as percentage (cap to prevent excessive fees) */
    maxFeePercent: number;

    /** Share of user's max slippage that solver captures (0.5 = 50%) */
    slippageSharePercent: number;
}
