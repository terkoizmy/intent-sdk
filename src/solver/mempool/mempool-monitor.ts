/**
 * Mempool Monitor — Phase G
 *
 * The main orchestrator of the mempool integration pipeline.
 * Listens for intents, filters them, solves viable ones via LiquidityAgent,
 * and submits results back to the mempool.
 *
 * Pipeline:
 *   new_intent event → IntentFilter.shouldSolve() → LiquidityAgent.solve()
 *   → SolutionSubmitter.submit()
 *
 * Stats tracking:
 *   - received: total intents from mempool
 *   - filtered: intents passing shouldSolve (attempted)
 *   - solved:   successfully completed solves
 *   - failed:   solve attempts that returned success=false
 *
 * Used by: LiquidityAgent.start() (Phase K wiring)
 */

import type { SolverIntent } from "../types/intent";
import type { LiquidityAgent } from "../agent/liquidity-agent";
import type { MempoolClient } from "./mempool-client";
import type { IntentFilter } from "./intent-filter";
import type { SolutionSubmitter } from "./solution-submitter";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MempoolStats {
    /** Total intents received from mempool */
    received: number;
    /** Intents that passed shouldSolve (were attempted) */
    filtered: number;
    /** Intents successfully solved */
    solved: number;
    /** Solve attempts that failed */
    failed: number;
}

// ─────────────────────────────────────────────
// MempoolMonitor
// ─────────────────────────────────────────────

export class MempoolMonitor {
    private running = false;
    private stats: MempoolStats = {
        received: 0,
        filtered: 0,
        solved: 0,
        failed: 0,
    };

    /** Bound handler saved for proper off() unregistration */
    private boundIntentHandler: (intent: SolverIntent) => void;

    constructor(
        private readonly client: MempoolClient,
        private readonly filter: IntentFilter,
        private readonly agent: LiquidityAgent,
        private readonly submitter: SolutionSubmitter,
    ) {
        // Bind once so we can unregister the same reference in stop()
        this.boundIntentHandler = (intent: SolverIntent) => {
            void this.handleIntent(intent);
        };
    }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Start listening to mempool intent events.
     *
     * Attaches "new_intent" listener on the client.
     * Also listens for "intent_solved" to update dedup cache.
     */
    start(): void {
        if (this.running) return;
        this.running = true;

        this.client.on("new_intent", this.boundIntentHandler);

        // When another solver solves an intent, mark it in our filter cache
        this.client.on("intent_solved", (payload: { intentId: string }) => {
            this.filter.markSolved(payload.intentId);
        });
    }

    /**
     * Stop listening and clean up event handlers.
     */
    stop(): void {
        if (!this.running) return;
        this.running = false;

        this.client.off("new_intent", this.boundIntentHandler);
        // Note: we leave "intent_solved" registered for the duration it was
        // attached, it's harmless as it only updates a Set and will be GC'd
        // when the client is destroyed.
    }

    /**
     * Get current processing stats.
     *
     * @returns Snapshot of received/filtered/solved/failed counters
     */
    getStats(): MempoolStats {
        return { ...this.stats };
    }

    /** Whether the monitor is currently listening */
    isRunning(): boolean {
        return this.running;
    }

    // ─────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────

    /**
     * Process a single incoming intent through the full pipeline.
     *
     * Errors within the solve pipeline are caught here so that
     * one bad intent doesn't crash the monitor loop.
     */
    private async handleIntent(intent: SolverIntent): Promise<void> {
        this.stats.received++;

        // 1. Filter
        if (!this.filter.shouldSolve(intent)) {
            return;
        }

        this.stats.filtered++;

        // 2. Solve
        try {
            const result = await this.agent.solve(intent);

            if (result.success) {
                this.stats.solved++;
                // 3. Submit
                this.submitter.submit(intent.intentId, result);
            } else {
                this.stats.failed++;
                // Log failure reason at debug level — not alertable
                console.debug(
                    `[MempoolMonitor] Intent ${intent.intentId} solve failed: ${result.error}`,
                );
            }
        } catch (err: unknown) {
            this.stats.failed++;
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[MempoolMonitor] Unexpected error solving ${intent.intentId}:`, message);
        }
    }
}
