/**
 * Inventory Monitor
 *
 * Polls on-chain balances at regular intervals and
 * alerts when unexpected changes are detected
 * (e.g. balance dropped without a corresponding intent).
 *
 * Runs as a background service alongside the main agent loop.
 */

import type { InventoryManager } from "./inventory-manager";

/**
 * Callback invoked when an unexpected balance change is detected.
 *
 * @param chainId - Chain where change was detected
 * @param token   - Token symbol
 * @param delta   - Balance change (negative = decrease)
 */
export type BalanceChangeCallback = (
    chainId: number,
    token: string,
    delta: bigint,
) => void;

export class InventoryMonitor {
    /** NodeJS interval handle (null when stopped) */
    private intervalHandle: ReturnType<typeof setInterval> | null = null;

    /** Previous snapshot for delta comparison */
    private previousBalances: Map<string, bigint> = new Map();

    /** Registered alert callbacks */
    private onChangeCallbacks: BalanceChangeCallback[] = [];

    constructor(
        private readonly inventoryManager: InventoryManager,
        /** Polling interval in milliseconds (default: 30_000) */
        private readonly intervalMs: number = 30_000,
    ) { }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Start polling balances at regular intervals.
     *
     * Calls inventoryManager.loadBalances() on each tick and
     * compares with the previous snapshot to detect changes.
     * Does nothing if already running.
     */
    start(): void {
        if (this.intervalHandle !== null) return;

        // Initial poll
        this.poll().catch(err => {
            console.error("Initial poll failed:", err);
        });

        this.intervalHandle = setInterval(() => {
            this.poll().catch(err => {
                console.error("Poll failed:", err);
            });
        }, this.intervalMs);

        console.log(`InventoryMonitor started, polling every ${this.intervalMs}ms`);
    }

    /**
     * Stop the polling interval.
     *
     * Safe to call if not running (idempotent).
     */
    stop(): void {
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            console.log("InventoryMonitor stopped");
        }
    }

    /**
     * Register a callback to be invoked when balance changes are detected.
     *
     * @param callback - Function called with (chainId, token, delta)
     */
    onChange(callback: BalanceChangeCallback): void {
        this.onChangeCallbacks.push(callback);
    }

    /**
     * Whether the monitor is currently running.
     */
    get isRunning(): boolean {
        return this.intervalHandle !== null;
    }

    // ─────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────

    /**
     * One polling tick.
     *
     * Reloads on-chain balances and fires change callbacks for any delta
     * detected since the last tick.
     *
     * TOCTOU note: there is a brief window between a bridge/send transaction
     * being broadcast and its confirmation on-chain. During that window,
     * loadBalances() will still see the pre-send balance, so a poll firing
     * in this gap will report no change. This self-corrects on the next tick
     * once the tx is mined. The locked amount is preserved across polls so
     * internal solvency checks remain accurate throughout.
     */
    private async poll(): Promise<void> {
        try {
            await this.inventoryManager.loadBalances();
            const snapshot = this.inventoryManager.getSnapshot();

            for (const balance of snapshot.balances) {
                // Track raw on-chain balance (`available` as set by loadBalances).
                // Locked amounts are internal state and do not reflect chain movement.
                const key = `${balance.chainId}:${balance.token}`;
                const prev = this.previousBalances.get(key);
                const current = balance.available;

                if (prev !== undefined && prev !== current) {
                    const delta = current - prev;
                    this.notifyChange(balance.chainId, balance.token, delta);
                }

                this.previousBalances.set(key, current);
            }
        } catch (error) {
            console.error("Error during inventory poll:", error);
        }
    }

    private notifyChange(chainId: number, token: string, delta: bigint): void {
        for (const cb of this.onChangeCallbacks) {
            try {
                cb(chainId, token, delta);
            } catch (e) {
                console.error("Error in onChange callback:", e);
            }
        }
    }
}
