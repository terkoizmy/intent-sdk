/**
 * Profit Tracker — Phase H
 *
 * Tracks expected vs actual profit for solved intents and provides
 * aggregate statistics for the LiquidityAgent operator.
 *
 * Used by: LiquidityAgent
 */

import type { PricingResult } from "../types/pricing";

export interface ProfitRecord {
    intentId: string;
    pricing: PricingResult;
    success?: boolean;
    actualGasUsed?: string;
    netProfit?: string;
    timestamp: number;
}

export interface ProfitStats {
    totalProfit: string;
    totalGasCost: string;
    successCount: number;
    failCount: number;
    avgProfit: string;
    totalAttempts: number;
}

export class ProfitTracker {
    private records: Map<string, ProfitRecord> = new Map();
    /** Timestamp of the first ever recordAttempt call — used for ROI period */
    private startedAt: number | null = null;

    /**
     * Record an intent that the agent is attempting to solve
     */
    recordAttempt(intentId: string, pricing: PricingResult): void {
        // Guard: warn if this intent is already tracked but not yet resolved
        const existing = this.records.get(intentId);
        if (existing && existing.success === undefined) {
            console.warn(`[ProfitTracker] Overwriting in-flight record for intent: ${intentId}`);
        }

        if (this.startedAt === null) {
            this.startedAt = Date.now();
        }

        this.records.set(intentId, {
            intentId,
            pricing,
            timestamp: Date.now(),
        });
    }

    /**
     * Record the final result of an attempted intent
     */
    recordResult(intentId: string, success: boolean, gasUsed?: string): void {
        const record = this.records.get(intentId);
        if (!record) {
            console.warn(`[ProfitTracker] Cannot record result for unknown intent: ${intentId}`);
            return;
        }

        record.success = success;
        record.actualGasUsed = gasUsed ?? record.pricing.gasCost;

        if (success) {
            // Net Profit = Total Fee Collected - Actual Gas Spent
            const totalFee = BigInt(record.pricing.totalFee);
            const actualGas = BigInt(record.actualGasUsed);
            record.netProfit = (totalFee - actualGas).toString();
        } else {
            // Unsuccessful translates to 0 net revenue (with actual loss = gas wasted)
            record.netProfit = "0";
        }
    }

    /**
     * Get aggregate statistics
     */
    getStats(periodMs?: number): ProfitStats {
        let totalProfit = 0n;
        let totalGasCost = 0n;
        let successCount = 0;
        let failCount = 0;

        const now = Date.now();

        for (const record of this.records.values()) {
            if (periodMs && now - record.timestamp > periodMs) {
                continue;
            }

            if (record.success === true) {
                successCount++;
                totalProfit += BigInt(record.netProfit || "0");
                totalGasCost += BigInt(record.actualGasUsed || "0");
            } else if (record.success === false) {
                failCount++;
            }
        }

        const totalAttempts = successCount + failCount;
        const avgProfit = successCount > 0 ? (totalProfit / BigInt(successCount)).toString() : "0";

        return {
            totalProfit: totalProfit.toString(),
            totalGasCost: totalGasCost.toString(),
            successCount,
            failCount,
            avgProfit,
            totalAttempts,
        };
    }

    /**
     * Get annualized ROI percentage based on capital deployed
     */
    getROI(capitalDeployed: string): number {
        const capital = BigInt(capitalDeployed);
        if (capital === 0n) return 0;

        const stats = this.getStats();
        if (stats.totalProfit === "0" || this.startedAt === null) return 0;

        // Safe precision: divide big-int profit by capital without converting
        // both to float until we have the ratio (which is << 2^53 in practice)
        const profitBn = BigInt(stats.totalProfit);
        // Represent ratio as numerator/denominator pair, then convert to float
        const ratioNumerator = Number(profitBn * 10_000_000n / capital); // 7 decimal places of room
        const roiPeriod = ratioNumerator / 10_000_000;

        // Use the tracked startedAt so we only iterate records once (in getStats)
        const elapsedMs = Date.now() - this.startedAt;
        if (elapsedMs === 0) return 0;

        const yearsElapsed = elapsedMs / (365 * 24 * 3600 * 1000);
        if (yearsElapsed === 0) return 0;

        return (roiPeriod / yearsElapsed) * 100; // Returns percentage %
    }
}
