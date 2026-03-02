/**
 * Fee Calculator
 *
 * Menghitung total biaya yang dikenakan solver kepada user.
 * Fee terdiri dari tiga komponen:
 *
 *   1. BASE FEE      — persentase dari amount (default 0.5%)
 *   2. GAS COST      — estimasi biaya gas dalam token (USDC)
 *   3. SLIPPAGE CAPTURE — bagian dari max slippage user yang solver ambil
 *
 * FORMULA:
 *   totalFee = baseFee + gasCost + slippageCapture
 *   userReceives = amount - totalFee
 *   solverProfit = totalFee - gasCost
 *
 * EXAMPLE (1000 USDC, ETH→Polygon):
 *   baseFee        = 5 USDC  (0.5%)
 *   gasCost        = 3 USDC  (ETH mainnet involved)
 *   slippageCapture = 5 USDC (50% of 1% max slippage on 1000 USDC)
 *   totalFee       = 13 USDC
 *   solverProfit   = 10 USDC
 */

import type { PricingConfig, PricingResult } from "../types/pricing";
import type { ChainId } from "../../types/common";
import { SlippageCapture } from "./slippage-capture";

// Chain ID constants untuk mencegah magic numbers
const ETHEREUM_MAINNET_ID: ChainId = 1;

/**
 * Parameters untuk kalkulasi fee tunggal.
 */
export interface FeeCalculationParams {
    /** Amount yang di-bridge dalam token smallest unit (e.g., 1000 USDC = 1_000_000_000n untuk 6 decimals) */
    amount: bigint;

    /** Chain tempat user menyimpan dana (source) */
    sourceChain: ChainId;

    /** Chain tujuan pengiriman (target) */
    targetChain: ChainId;

    /** Token symbol (e.g., "USDC") */
    token: string;

    /** Max slippage yang diizinkan user, dalam basis points (100 = 1%) */
    maxSlippageBps: number;

    /** Jumlah desimal token (6 untuk USDC, 18 untuk ETH) */
    tokenDecimals?: number;
}

export class FeeCalculator {
    private readonly slippageCapture: SlippageCapture;

    constructor(
        private readonly config: PricingConfig,
    ) {
        this.slippageCapture = new SlippageCapture(config);
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Hitung full fee breakdown untuk sebuah bridge intent.
     *
     * Langkah:
     *   1. Hitung base fee dari `amount * baseFeePercent`, clamp ke [minFee, maxFee]
     *   2. Estimasi gas cost via `estimateGasCost()`
     *   3. Hitung slippage capture via `SlippageCapture.calculate()`
     *   4. Gabungkan menjadi PricingResult
     *
     * @param params - FeeCalculationParams
     * @returns PricingResult dengan semua fee breakdown
     */
    calculate(params: FeeCalculationParams): PricingResult {
        // 1. Base Fee
        const tokenDecimals = params.tokenDecimals ?? 6;
        const baseFee = this.calculateBaseFee(params.amount, tokenDecimals);

        // 2. Gas Cost
        const gasCost = this.estimateGasCost(params.sourceChain, params.targetChain);

        // 3. Slippage Capture — delegasi ke SlippageCapture
        const slippageCapture = this.slippageCapture.calculate(params.amount, params.maxSlippageBps);

        // 4. Totals
        const totalFee = baseFee + gasCost + slippageCapture;

        let userReceives = params.amount - totalFee;
        if (userReceives < 0n) userReceives = 0n;

        const solverProfit = totalFee - gasCost;

        return {
            baseFee: baseFee.toString(),
            gasCost: gasCost.toString(),
            slippageCapture: slippageCapture.toString(),
            totalFee: totalFee.toString(),
            userPays: params.amount.toString(),
            userReceives: userReceives.toString(),
            solverProfit: solverProfit.toString(),
        };
    }

    /**
     * Hitung base fee saja dari sebuah amount.
     *
     * Berguna untuk quick check profitabilitas tanpa full pricing.
     *
     * @param amount       - Amount dalam token's smallest unit
     * @param tokenDecimals - Jumlah desimal token (default 6 untuk USDC)
     * @returns Base fee dalam token's smallest unit (bigint)
     */
    calculateBaseFee(amount: bigint, tokenDecimals = 6): bigint {
        // config.baseFeePercent is e.g. 0.005. Convert to BPS: 0.005 * 10000 = 50.
        const baseFeeBps = BigInt(Math.round(this.config.baseFeePercent * 10000));
        const fee = (amount * baseFeeBps) / 10000n;

        // Min Fee: $1 * 10^decimals. Assumes 1 USDC = $1 (stablecoin-centric for now).
        const minFee = BigInt(Math.floor(this.config.minFeeUSD)) * (10n ** BigInt(tokenDecimals));

        // Max Fee cap: prevent excessive fees on very large transfers
        const maxFeeBps = BigInt(Math.floor(this.config.maxFeePercent * 10000));
        const maxFee = (amount * maxFeeBps) / 10000n;

        // minFeeUSD is a hard floor — takes priority over maxFeePercent for tiny amounts.
        // This is intentional: fixed operational costs must be covered regardless of %.
        if (fee < minFee) return minFee;
        if (fee > maxFee) return maxFee;
        return fee;
    }

    /**
     * Estimasi biaya gas dalam token equivalent (USDC).
     *
     * Logika:
     *   - Cross-chain (sourceChain !== targetChain) jauh lebih mahal dari single-chain
     *   - Ethereum mainnet memiliki gas cost tertinggi karena konsensus proof-of-stake
     *     dan tingginya demand block space
     *   - L2 (Polygon, Arbitrum) jauh lebih murah
     *
     * Gunakan hardcoded baseline yang akan diganti real gas oracle di Phase I.
     *
     * @param sourceChain - Chain ID asal
     * @param targetChain - Chain ID tujuan (opsional, untuk cross-chain estimate)
     * @returns Gas cost estimasi dalam USDC (6 decimals, bigint)
     */
    estimateGasCost(sourceChain: ChainId, targetChain?: ChainId): bigint {
        const USDC_UNIT = 10_000n; // 1 USDC = 1_000_000 (6 decimals)

        // Single chain — cheap (e.g. same-chain swap)
        if (targetChain && sourceChain === targetChain) {
            return (50n * USDC_UNIT) / 100n; // 0.50 USDC
        }

        // Cross-chain path involving Ethereum Mainnet is significantly more expensive
        const involvesEth = sourceChain === ETHEREUM_MAINNET_ID || targetChain === ETHEREUM_MAINNET_ID;

        if (involvesEth) {
            return 3n * USDC_UNIT; // $3.00 — ETH L1 gas premium
        }

        // L2 to L2 (e.g., Polygon ↔ Arbitrum) — cheap
        return 1n * USDC_UNIT; // $1.00 baseline
    }

    /**
     * Cek apakah sebuah intent worth solving (profitable setelah fee).
     *
     * Intent tidak worth solving jika:
     *   - Amount terlalu kecil sehingga fee > amount
     *   - Cross-chain gas cost > baseFee (loss scenario)
     *
     * Note: Slippage capture diabaikan di sini (conservative check).
     *
     * @param amount      - Amount dalam token's smallest unit
     * @param sourceChain - Chain ID asal
     * @param targetChain - Chain ID tujuan
     * @returns true jika worth solving, false jika tidak
     */
    isWorthSolving(amount: bigint, sourceChain: ChainId, targetChain: ChainId): boolean {
        const baseFee = this.calculateBaseFee(amount);
        const gasCost = this.estimateGasCost(sourceChain, targetChain);

        // Base fee alone must cover gas cost (conservative, ignores slippage capture profit)
        const solverProfit = baseFee - gasCost;

        return solverProfit >= 0n;
    }
}
