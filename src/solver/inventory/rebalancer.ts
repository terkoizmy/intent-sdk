/**
 * Rebalancer
 *
 * Detects when inventory is unevenly distributed across chains
 * and triggers cross-chain bridging to restore target distribution.
 *
 * Uses the Swing.xyz aggregator (Phase I) to find the best bridge route.
 * Priority order: critical > high > medium > low.
 *
 * EXAMPLE:
 *   Target: 50% ETH, 50% Polygon
 *   Actual: 80% ETH, 20% Polygon
 *   → RebalanceTask { fromChain: 1, toChain: 137, amount: 30% of total }
 */

import type { InventoryManager } from "./inventory-manager";
import type { RebalanceTask } from "../types/inventory";
import type { ExecutionResult } from "../types/execution";
import type { InventoryConfig } from "../types/inventory";
import type { ChainId } from "../../types/common";

/**
 * Protocol interface for bridge/rebalancing.
 * Implemented by SwingProtocol in Phase I.
 */
export interface IBridgeProtocol {
    /**
     * Get a quote for bridging from one chain to another.
     * Returns estimated output amount and bridge fee.
     */
    quote(params: {
        fromChain: number;
        toChain: number;
        token: string;
        amount: bigint;
    }): Promise<{ outputAmount: bigint; fee: bigint; estimatedTimeMs: number }>;

    /**
     * Execute the bridge transfer.
     * Returns the execution result with txHash.
     */
    bridge(params: {
        fromChain: number;
        toChain: number;
        token: string;
        amount: bigint;
        recipient: string;
    }): Promise<ExecutionResult>;
}

export class Rebalancer {
    constructor(
        private readonly inventoryManager: InventoryManager,
        private readonly bridgeProtocol: IBridgeProtocol,
        private readonly config: InventoryConfig,
        /** Agent address to receive funds on destination */
        private readonly agentAddress: string,
    ) { }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Detect chains whose balance deviates from target distribution.
     *
     * Uses **net available balance** (available − locked) per chain so the
     * calculation is consistent with getTotalBalance(), which also uses net.
     *
     * @param token - Token symbol to check. Defaults to "USDC".
     * @returns Array of RebalanceTasks sorted by priority (critical first)
     */
    needsRebalancing(token = "USDC"): RebalanceTask[] {
        const total = this.inventoryManager.getTotalBalance(token);
        if (total === 0n) return [];

        const snapshot = this.inventoryManager.getSnapshot();
        const tasks: RebalanceTask[] = [];

        // Group balances by chain using NET available (available − locked).
        // Must match getTotalBalance() semantics — both use net — so that
        // per-chain percentages add up to 100%.
        const chainBalances = new Map<ChainId, bigint>();
        for (const b of snapshot.balances) {
            if (b.token === token) {
                const net = b.available - b.locked;
                chainBalances.set(b.chainId, net > 0n ? net : 0n);
            }
        }

        // Clone targetDistribution to avoid mutating the config object.
        // Record<string, number> is used because JS object keys are always strings;
        // chain IDs are coerced to string when used as keys.
        const targets: Record<string, number> = this.config.targetDistribution
            ? { ...this.config.targetDistribution }
            : {};
        const chainIds = Array.from(chainBalances.keys());

        // If no explicit targets, distribute equally among active chains
        if (Object.keys(targets).length === 0 && chainIds.length > 0) {
            const share = 1 / chainIds.length;
            chainIds.forEach(id => {
                targets[String(id)] = share;
            });
        }

        // Calculate deviations
        const excesses: Array<{ chainId: ChainId; amount: bigint }> = [];
        const deficits: Array<{ chainId: ChainId; amount: bigint }> = [];

        // Iterate over the union of chains with a balance and chains with a target
        const allChains = new Set([...chainIds, ...Object.keys(targets).map(Number)]);

        for (const chainId of allChains) {
            const current = chainBalances.get(chainId) ?? 0n;
            // Keys are stored as strings; coerce chainId to string for lookup
            const targetPercent = targets[String(chainId)] ?? 0;

            // Target amount = total * targetPercent using basis-point integer math
            const bps = BigInt(Math.floor(targetPercent * 10000));
            const targetAmount = (total * bps) / 10000n;

            if (current > targetAmount) {
                excesses.push({ chainId, amount: current - targetAmount });
            } else if (current < targetAmount) {
                deficits.push({ chainId, amount: targetAmount - current });
            }
        }

        // Match excesses to deficits.
        // Greedy strategy: pair largest excess with largest deficit first.
        // Use a safe bigint comparator to avoid Number precision loss for very
        // large amounts (> Number.MAX_SAFE_INTEGER ≈ 9 quadrillion raw units).
        const safeCmp = (a: bigint, b: bigint) => (a > b ? -1 : a < b ? 1 : 0);
        excesses.sort((a, b) => safeCmp(a.amount, b.amount));
        deficits.sort((a, b) => safeCmp(a.amount, b.amount));

        // Pair tasks (token is the parameterised token, not hardcoded)

        let eIdx = 0;
        let dIdx = 0;

        while (eIdx < excesses.length && dIdx < deficits.length) {
            const source = excesses[eIdx];
            const target = deficits[dIdx];

            // Amount to move is min(excess, deficit)
            let amount = source.amount < target.amount ? source.amount : target.amount;

            // Check if this move is significant enough (deviation > threshold)
            // Deviation = amount / total
            const deviation = Number(amount) / Number(total);

            if (deviation > this.config.rebalanceThreshold) {
                let priority: "low" | "medium" | "high" | "critical" = "low";
                if (deviation > 0.5) priority = "critical";
                else if (deviation > 0.3) priority = "high";
                else if (deviation > this.config.rebalanceThreshold) priority = "medium";

                tasks.push({
                    fromChain: source.chainId,
                    toChain: target.chainId,
                    token,
                    amount,
                    reason: `Deviation ${(deviation * 100).toFixed(1)}% exceeds threshold`,
                    priority,
                });
            }

            // Update remaining amounts
            source.amount -= amount;
            target.amount -= amount;

            if (source.amount === 0n) eIdx++;
            if (target.amount === 0n) dIdx++;
        }

        // Sort by priority
        const priorityWeight = { "critical": 4, "high": 3, "medium": 2, "low": 1 };
        return tasks.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
    }

    /**
     * Execute a single rebalance task.
     */
    async execute(task: RebalanceTask): Promise<ExecutionResult> {
        console.log(`Executing rebalance: ${task.amount} ${task.token} from ${task.fromChain} to ${task.toChain}`);

        try {
            // 1. Get quote to verify feasibility
            const quote = await this.bridgeProtocol.quote({
                fromChain: task.fromChain,
                toChain: task.toChain,
                token: task.token,
                amount: task.amount,
            });

            console.log(`Bridge quote: Fee ${quote.fee}, Output ${quote.outputAmount}`);

            // 2. Lock funds BEFORE calling bridge.
            //    Any concurrent canFulfill() check will immediately see the
            //    reservation, preventing double-spending.
            //    If lockAmount throws (e.g. insufficient balance), the bridge
            //    is never called and the exception propagates to the catch block.
            const rebalanceId = `rebalance-${Date.now()}`;
            this.inventoryManager.lockAmount(task.fromChain, task.token, task.amount, rebalanceId);

            // 3. Execute bridge
            const result = await this.bridgeProtocol.bridge({
                fromChain: task.fromChain,
                toChain: task.toChain,
                token: task.token,
                amount: task.amount,
                recipient: this.agentAddress,
            });

            if (result.success) {
                // 4a. Success — confirm deduction (consumes the lock and reduces available).
                this.inventoryManager.confirmDeduction(task.fromChain, task.token, task.amount, rebalanceId);
                console.log(`Rebalance tx sent: ${result.txHash}`);
            } else {
                // 4b. Failure — release the lock to restore available balance.
                console.error("Rebalance failed execution:", result.error);
                this.inventoryManager.unlockAmount(task.fromChain, task.token, task.amount, rebalanceId);
            }

            return result;

        } catch (error) {
            console.error("Rebalance exception:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Run full auto-rebalance cycle.
     */
    async autoRebalance(): Promise<void> {
        const tasks = this.needsRebalancing();
        if (tasks.length === 0) {
            console.log("Inventory balanced, no rebalancing needed.");
            return;
        }

        console.log(`Found ${tasks.length} rebalance tasks`);
        let totalCost = 0n;

        for (const task of tasks) {
            // Double check availability before executing
            if (this.inventoryManager.canFulfill(task.fromChain, task.token, task.amount)) {
                const result = await this.execute(task);
                if (result.success) {
                    totalCost += 0n; // TODO: Parse gas cost from result if available
                }
            } else {
                console.warn(`Skipping rebalance task due to insufficient funds: ${task.fromChain} -> ${task.toChain}`);
            }
        }
    }
}
