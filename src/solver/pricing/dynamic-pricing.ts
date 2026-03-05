/**
 * Dynamic Pricing
 *
 * Menyesuaikan fee multiplier berdasarkan kondisi inventory saat ini.
 * Semakin langka inventory di chain tertentu, semakin tinggi harga yang dikenakan.
 *
 * TUJUAN:
 *   - Mencegah pengurasan inventory satu chain secara cepat (flood protection)
 *   - Mendorong rebalancing secara ekonomi: harga tinggi → solver rebalance lebih cepat
 *   - Memberikan keunggulan kompetitif di kondisi surplus (harga lebih rendah = lebih sering menang)
 *
 * INVENTORY MULTIPLIER TABLE:
 *   ≥ 80% capacity  → 0.8x  (surplus, bersaing aggressive)
 *   50–79% capacity → 1.0x  (normal)
 *   20–49% capacity → 1.5x  (low, mulai naikkan harga)
 *   < 20% capacity  → 2.0x  (critical, hampir habis)
 *
 * FORMULA:
 *   finalFee = baseFee * inventoryMultiplier
 *
 * NOTE: Multiplier diterapkan HANYA ke baseFee, bukan ke gasCost.
 *       gasCost selalu tetap (reflek biaya aktual, bukan inventory state).
 */

import type { PricingConfig, PricingResult } from "../types/pricing";
import type { SolverIntent } from "../types/intent";
import type { ChainId } from "../../types/common";
import type { InventoryManager } from "../inventory/inventory-manager";
import { FeeCalculator } from "./fee-calculator";
import { SlippageCapture } from "./slippage-capture";

// ─────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────

/**
 * Inventory tier definitions.
 * Each tier has a capacity threshold (inclusive lower bound) and a multiplier.
 * Tiers are checked from highest to lowest.
 *
 * Multiplier is expressed as [numerator, denominator] to enable lossless BigInt math.
 * e.g. 0.8x → [8, 10], 1.5x → [15, 10], 2.0x → [20, 10]
 */
const INVENTORY_TIERS: Array<{ threshold: number; multiplierNum: bigint; multiplierDen: bigint; value: number }> = [
    { threshold: 0.8, multiplierNum: 8n, multiplierDen: 10n, value: 0.8 },
    { threshold: 0.5, multiplierNum: 10n, multiplierDen: 10n, value: 1.0 },
    { threshold: 0.2, multiplierNum: 15n, multiplierDen: 10n, value: 1.5 },
    { threshold: 0, multiplierNum: 20n, multiplierDen: 10n, value: 2.0 }, // critical fallback
];

/** Capacity below this triggers hard rejection regardless of price */
const CRITICAL_CAPACITY_FLOOR = 0.05;

/**
 * Safely compute capacity ratio (current / total) as a JS number.
 * Uses BigInt-based scaling when operands exceed Number.MAX_SAFE_INTEGER
 * to prevent silent precision loss in floating-point conversion.
 */
function safeCapacityRatio(current: bigint, total: bigint): number {
    if (total === 0n) return 0;
    // If both values fit in a safe JS number, use plain division
    if (current <= BigInt(Number.MAX_SAFE_INTEGER) && total <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(current) / Number(total);
    }
    // Scale to 1e6 precision via BigInt division to avoid float overflow
    const SCALE = 1_000_000n;
    return Number((current * SCALE) / total) / Number(SCALE);
}

/** Default settlement token for inventory checks */
const DEFAULT_INVENTORY_TOKEN = "USDC";

export class DynamicPricing {
    private readonly feeCalculator: FeeCalculator;
    private readonly slippageCapture: SlippageCapture;

    constructor(
        private readonly config: PricingConfig,
        private readonly inventoryManager: InventoryManager,
    ) {
        this.feeCalculator = new FeeCalculator(config);
        this.slippageCapture = new SlippageCapture(config);
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Hitung harga final untuk sebuah intent dengan dynamic multiplier.
     *
     * Langkah:
     *   1. Extract params dari SolverIntent (amount, sourceChain, targetChain, maxSlippage)
     *   2. Hitung base pricing via FeeCalculator
     *   3. Apply inventory multiplier dari getInventoryMultiplier()
     *   4. Re-compute totalFee dan solverProfit dengan nilai yang sudah di-adjust
     *
     * @param intent - SolverIntent yang akan di-price
     * @returns PricingResult dengan multiplier sudah diterapkan
     */
    getPrice(intent: SolverIntent): PricingResult {
        // 1. Extract intent parameters
        const params = intent.parsedIntent.parameters;
        if (intent.parsedIntent.intentType !== "bridge") {
            throw new Error(`Unsupported intent type for pricing: ${intent.parsedIntent.intentType}`);
        }

        if (!params.inputAmount || !params.inputToken || !params.sourceChain || !params.targetChain) {
            throw new Error("Invalid bridge intent: missing required parameters");
        }

        const amount = BigInt(params.inputAmount);
        const sourceChain = Number(params.sourceChain) as ChainId;
        const targetChain = Number(params.targetChain) as ChainId;
        const maxSlippageBps = intent.parsedIntent.constraints.maxSlippage ?? 100;
        // Use the intent's token symbol for inventory checks (default to USDC for stablecoins)
        const token = typeof params.inputToken === "string" ? params.inputToken : DEFAULT_INVENTORY_TOKEN;

        // 2. Get base fees from FeeCalculator
        const rawPricing = this.feeCalculator.calculate({
            amount,
            sourceChain,
            targetChain,
            token,
            maxSlippageBps,
        });

        // 3. Apply inventory multiplier using BigInt arithmetic (no float precision loss)
        const { multiplierNum, multiplierDen } = this._getTierForChain(targetChain, token);
        const baseFeeVal = BigInt(rawPricing.baseFee);
        const adjustedBaseFee = (baseFeeVal * multiplierNum) / multiplierDen;

        // 4. Reconstruct totals with adjusted base fee
        const gasCost = BigInt(rawPricing.gasCost);
        const slippageCapture = BigInt(rawPricing.slippageCapture);

        const totalFee = adjustedBaseFee + gasCost + slippageCapture;

        let userReceives = amount - totalFee;
        if (userReceives < 0n) userReceives = 0n;

        const solverProfit = totalFee - gasCost;

        return {
            baseFee: adjustedBaseFee.toString(),
            gasCost: gasCost.toString(),
            slippageCapture: slippageCapture.toString(),
            totalFee: totalFee.toString(),
            userPays: amount.toString(),
            userReceives: userReceives.toString(),
            solverProfit: solverProfit.toString(),
        };
    }

    /**
     * Tentukan inventory multiplier (sebagai number) berdasarkan kapasitas chain.
     *
     * "Kapasitas" didefinisikan sebagai proporsi balance chain ini terhadap total semua chain.
     *   capacity = getBalance(chainId, token) / getTotalBalance(token)
     *
     * MULTIPLIER TIERS:
     *   capacity >= 0.8  → 0.8  (surplus mode)
     *   capacity >= 0.5  → 1.0  (normal)
     *   capacity >= 0.2  → 1.5  (low inventory)
     *   capacity <  0.2  → 2.0  (critical)
     *
     * @param chainId - Chain yang akan di-check inventory-nya
     * @param amount  - Amount yang dibutuhkan (unused, tersedia untuk future use)
     * @param token   - Token symbol untuk inventory check (default: "USDC")
     * @returns Multiplier float (0.8 / 1.0 / 1.5 / 2.0)
     */
    getInventoryMultiplier(chainId: ChainId, amount: bigint, token = DEFAULT_INVENTORY_TOKEN): number {
        return this._getTierForChain(chainId, token).value;
    }

    /**
     * Cek apakah inventory di chain tertentu sudah terlalu kritis
     * untuk menerima intent baru (reject outright, bukan hanya naikkan harga).
     *
     * Hard limit: inventory < 5% capacity (critical floor).
     * Bahkan dengan multiplier 2.0x, menerima intent di kondisi ini
     * berisiko menguras habis inventory.
     *
     * @param chainId - Chain yang akan di-check
     * @param amount  - Amount intent yang diminta
     * @param token   - Token symbol untuk inventory check (default: "USDC")
     * @returns true jika harus di-reject, false jika aman diterima
     */
    shouldReject(chainId: ChainId, amount: bigint, token = DEFAULT_INVENTORY_TOKEN): boolean {
        // 1. Check strict availability first (includes reserve check)
        if (!this.inventoryManager.canFulfill(chainId, token, amount)) {
            return true;
        }

        // 2. Check hard capacity floor
        const current = this.inventoryManager.getBalance(chainId, token);
        const total = this.inventoryManager.getTotalBalance(token);

        if (total === 0n) return true; // Should be caught by canFulfill, but safety guard

        const capacity = safeCapacityRatio(current, total);

        // Reject if capacity is critically low to force rebalancing before draining chain
        return capacity < CRITICAL_CAPACITY_FLOOR;
    }

    // ─────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────

    /**
     * Kembalikan tier (multiplierNum, multiplierDen, value) untuk chain berdasarkan kapasitas.
     * Menggunakan BigInt fraction (num/den) untuk menghindari float precision loss
     * saat diaplikasikan ke baseFee yang mungkin sangat besar (token 18 desimal).
     */
    private _getTierForChain(chainId: ChainId, token: string) {
        const current = this.inventoryManager.getBalance(chainId, token);
        const total = this.inventoryManager.getTotalBalance(token);

        // No inventory anywhere → critical tier
        if (total === 0n) return INVENTORY_TIERS[INVENTORY_TIERS.length - 1]!;

        const capacity = safeCapacityRatio(current, total);

        // Find first matching tier (ordered highest threshold → lowest)
        for (const tier of INVENTORY_TIERS) {
            if (capacity >= tier.threshold) return tier;
        }

        // Should never reach here as last tier has threshold 0
        return INVENTORY_TIERS[INVENTORY_TIERS.length - 1]!;
    }
}
