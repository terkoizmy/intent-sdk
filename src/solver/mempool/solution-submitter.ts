/**
 * Solution Submitter — Phase G
 *
 * Formats and submits a solved intent's result back to the mempool server.
 * Handles race conditions where another solver already claimed the intent.
 *
 * Used by: MempoolMonitor
 */

import type { SolutionResult } from "../types/agent";
import type { MempoolClient } from "./mempool-client";

/** Result of a submission attempt */
export interface SubmitOutcome {
    /** Whether submission was sent successfully */
    submitted: boolean;
    /** Whether submission was skipped because the intent was already solved */
    alreadySolved: boolean;
    /** Error if submission failed for some other reason */
    error?: string;
}

export class SolutionSubmitter {
    constructor(private readonly client: MempoolClient) { }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Submit a solution result to the mempool server.
     *
     * On success: sends the txHash + profit to the server.
     * On "already solved" race condition: logs a warning and skips silently.
     * On failure: logs the error and returns error outcome.
     *
     * @param intentId - The intent being submitted
     * @param result   - SolutionResult from LiquidityAgent.solve()
     * @returns SubmitOutcome describing what happened
     */
    submit(intentId: string, result: SolutionResult): SubmitOutcome {
        if (!result.success) {
            // Don't submit failed solutions — they don't need to go to mempool
            return { submitted: false, alreadySolved: false };
        }

        if (!this.client.isConnected()) {
            console.warn(`[SolutionSubmitter] Cannot submit ${intentId}: not connected to mempool`);
            return {
                submitted: false,
                alreadySolved: false,
                error: "Not connected to mempool",
            };
        }

        try {
            this.client.submitSolution(
                intentId,
                result.txHash,
                result.metadata?.sourceChainId?.toString(),
                result.profit,
            );

            return { submitted: true, alreadySolved: false };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);

            // Detect "already solved" — another solver was faster
            if (this.isAlreadySolvedError(message)) {
                console.warn(`[SolutionSubmitter] Intent ${intentId} already solved by another solver`);
                return { submitted: false, alreadySolved: true };
            }

            console.error(`[SolutionSubmitter] Failed to submit ${intentId}:`, message);
            return { submitted: false, alreadySolved: false, error: message };
        }
    }

    // ─────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────

    /**
     * Detect "already solved" error messages from the mempool server.
     * Protocol-agnostic heuristic covering common error wordings.
     */
    private isAlreadySolvedError(message: string): boolean {
        const lower = message.toLowerCase();
        return (
            lower.includes("already solved") ||
            lower.includes("already claimed") ||
            lower.includes("intent_not_found") ||
            lower.includes("duplicate")
        );
    }
}
