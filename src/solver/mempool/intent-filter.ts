/**
 * Intent Filter — Phase G
 *
 * Decides whether an incoming intent from the mempool should be
 * attempted by this agent. Filters are applied in order from
 * cheapest to most expensive to minimize wasted work.
 *
 * Filter pipeline:
 *   1. Deduplication    — Skip if intentId already seen
 *   2. Type check       — Only "bridge" intents
 *   3. Agent capability — agent.canSolve(intent)
 *
 * Used by: MempoolMonitor
 */

import type { SolverIntent } from "../types/intent";
import type { LiquidityAgent } from "../agent/liquidity-agent";

export class IntentFilter {
    /** Track seen intentIds to prevent duplicate processing */
    private seen: Set<string> = new Set();

    /** Maximum number of entries in the seen cache before pruning */
    private readonly maxCacheSize: number;

    constructor(
        private readonly agent: LiquidityAgent,
        options?: { maxCacheSize?: number },
    ) {
        this.maxCacheSize = options?.maxCacheSize ?? 10_000;
    }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Determine whether this agent should attempt solving the intent.
     *
     * Returns false immediately at the first failing check.
     *
     * @param intent - Incoming SolverIntent from the mempool
     * @returns true if the agent should attempt solving, false otherwise
     */
    shouldSolve(intent: SolverIntent): boolean {
        // 1. Deduplication — skip already-seen intents
        if (this.seen.has(intent.intentId)) {
            return false;
        }

        // Mark as seen immediately to prevent concurrent processors
        // from racing on the same intent
        this.addToSeen(intent.intentId);

        // 2. Type check — only handle bridge intents
        if (intent.parsedIntent.intentType !== "bridge") {
            return false;
        }

        // 3. Agent capability check — chains, tokens, expiry, inventory
        if (!this.agent.canSolve(intent)) {
            return false;
        }

        return true;
    }

    /**
     * Mark an intent as "already solved" so it won't be attempted again
     * if it re-appears in the mempool (e.g., rebroadcast).
     *
     * @param intentId - The intentId to mark as solved
     */
    markSolved(intentId: string): void {
        this.addToSeen(intentId);
    }

    /**
     * Get count of unique intentIds seen so far.
     * Useful for monitoring / debugging.
     */
    getSeenCount(): number {
        return this.seen.size;
    }

    /**
     * Clear the deduplication cache.
     * Use with caution — only if you intentionally want to reprocess intents.
     */
    clearCache(): void {
        this.seen.clear();
    }

    // ─────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────

    /**
     * Add an intentId to the seen cache, pruning oldest entries
     * if the cache exceeds maxCacheSize.
     *
     * Pruning strategy: drop the oldest half of entries (Set iterates
     * in insertion order) to amortize pruning cost.
     */
    private addToSeen(intentId: string): void {
        this.seen.add(intentId);

        if (this.seen.size > this.maxCacheSize) {
            const deleteCount = Math.floor(this.maxCacheSize / 2);
            let i = 0;
            for (const id of this.seen) {
                if (i >= deleteCount) break;
                this.seen.delete(id);
                i++;
            }
        }
    }
}
