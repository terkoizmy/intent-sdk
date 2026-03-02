/**
 * Slippage Capture
 *
 * Menghitung "slippage profit" — keuntungan tambahan solver
 * dari selisih antara max slippage yang diizinkan user dan
 * slippage aktual yang terjadi di market.
 *
 * KONSEP:
 *   User mengizinkan max 1% slippage untuk bridge 1000 USDC.
 *   Solver hanya butuh 0% slippage (karena punya inventory pre-funded).
 *   Maka solver dapat capture 50% dari 1% = 0.5% = 5 USDC profit.
 *
 * FORMULA:
 *   captureAmount = amount × (maxSlippageBps / 10_000) × slippageSharePercent
 *   userEffectiveOutput = amount - captureAmount
 *
 * EXAMPLE:
 *   amount          = 1_000_000_000 (1000 USDC, 6 decimals)
 *   maxSlippageBps  = 100 (1%)
 *   sharePercent    = 0.5 (50%)
 *   captureAmount   = 1000 × 0.01 × 0.5 = 5 USDC = 5_000_000
 */

import type { PricingConfig } from "../types/pricing";

export class SlippageCapture {
    constructor(
        private readonly config: PricingConfig,
    ) { }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Hitung berapa banyak slippage yang bisa di-capture solver.
     *
     * Gunakan integer math sepenuhnya untuk menghindari floating point error.
     * Basis point (1/10000) digunakan untuk semua perhitungan persentase.
     *
     * @param amount         - Amount yang di-bridge dalam token smallest unit
     * @param maxSlippageBps - Max slippage yang diizinkan user dalam basis points (100 = 1%)
     * @returns Jumlah slippage yang di-capture, dalam token smallest unit (bigint)
     */
    calculate(amount: bigint, maxSlippageBps: number): bigint {
        if (maxSlippageBps <= 0) return 0n;

        // Clamp ke 100% tanpa mutate parameter asli
        const effectiveSlippageBps = Math.min(maxSlippageBps, 10000);

        const shareBps = BigInt(Math.floor(this.config.slippageSharePercent * 10000));
        const slippageBps = BigInt(effectiveSlippageBps);

        // amount * (maxSlippage / 10000) * (share / 10000)
        return (amount * slippageBps * shareBps) / (10000n * 10000n);
    }

    /**
     * Hitung output efektif yang diterima user setelah slippage capture.
     *
     * @param amount        - Amount asli yang di-bridge (sebelum fees)
     * @param captureAmount - Slippage yang di-capture (hasil dari calculate())
     * @returns Amount yang diterima user, clamped ke 0 jika negative
     */
    getEffectiveUserOutput(amount: bigint, captureAmount: bigint): bigint {
        const result = amount - captureAmount;
        return result > 0n ? result : 0n;
    }
}
