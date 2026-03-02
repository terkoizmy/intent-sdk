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

    constructor(private readonly agent: LiquidityAgent) { }

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
        this.seen.add(intent.intentId);

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
        this.seen.add(intentId);
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
}
