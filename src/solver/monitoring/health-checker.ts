/**
 * Health Checker — Phase H
 *
 * Aggregates health status of all critical solver subsystems
 * (RPC, Inventory, Mempool).
 *
 * Used by: Monitoring dashboard / AlertManager
 */

import type { InventoryManager } from "../inventory/inventory-manager";
import type { MempoolClient } from "../mempool/mempool-client";
import type { RPCProviderManager } from "../../shared/rpc/provider-manager";

export interface HealthCheckResult {
    healthy: boolean;
    checks: {
        rpc: { healthy: boolean; details?: string };
        inventory: { healthy: boolean; details?: string };
        mempool: { healthy: boolean; details?: string };
    };
    timestamp: number;
}

export class HealthChecker {
    /** Cached result from last check() call */
    private lastResult: HealthCheckResult | null = null;
    /** TTL for isHealthy() cache in ms (default 10 seconds) */
    private readonly cacheTtlMs: number;

    constructor(
        private readonly deps: {
            inventoryManager: InventoryManager;
            mempoolClient: MempoolClient;
            rpcProviderManager: RPCProviderManager;
        },
        cacheTtlMs = 10_000,
    ) {
        this.cacheTtlMs = cacheTtlMs;
    }

    /**
     * Perform a full health check across all subsystems
     * @returns Detailed health check result
     */
    async check(): Promise<HealthCheckResult> {
        const { inventoryManager, mempoolClient, rpcProviderManager } = this.deps;

        // 1. RPC Check
        let rpcHealthy = true;
        let rpcDetails = "All providers ok";
        try {
            const rpcHealth = await rpcProviderManager.checkHealth();
            let failedCount = 0;
            for (const [, isHealthy] of rpcHealth.entries()) {
                if (!isHealthy) failedCount++;
            }
            if (failedCount > 0) {
                rpcHealthy = false;
                rpcDetails = `${failedCount} provider(s) down`;
            }
        } catch (e: unknown) {
            rpcHealthy = false;
            rpcDetails = e instanceof Error ? e.message : "RPC check failed";
            console.error(`[HealthChecker] RPC check threw:`, rpcDetails);
        }

        // 2. Inventory Check
        let inventoryHealthy = false;
        let inventoryDetails = "No available balances";
        try {
            const snapshot = inventoryManager.getSnapshot();
            if (snapshot.balances && snapshot.balances.length > 0) {
                // Determine healthy if there's > 0 balance globally or tracked chains have some value
                for (const bal of snapshot.balances) {
                    if (BigInt(bal.available) > 0n) {
                        inventoryHealthy = true;
                        inventoryDetails = "Balances available";
                        break;
                    }
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Inventory check failed";
            inventoryDetails = msg;
            console.error(`[HealthChecker] Inventory check threw:`, msg);
        }

        // 3. Mempool Check
        const mempoolHealthy = mempoolClient.isConnected();
        const mempoolDetails = mempoolHealthy ? "Connected" : "Disconnected";

        const healthy = rpcHealthy && inventoryHealthy && mempoolHealthy;

        return {
            healthy,
            checks: {
                rpc: { healthy: rpcHealthy, details: rpcDetails },
                inventory: { healthy: inventoryHealthy, details: inventoryDetails },
                mempool: { healthy: mempoolHealthy, details: mempoolDetails },
            },
            timestamp: Date.now(),
        };
    }

    /**
     * Quick boolean check of overall health.
     * Result is cached for `cacheTtlMs` to avoid per-call network calls.
     * Pass `force = true` to skip the cache.
     */
    async isHealthy(force = false): Promise<boolean> {
        const now = Date.now();
        if (!force && this.lastResult && (now - this.lastResult.timestamp) < this.cacheTtlMs) {
            return this.lastResult.healthy;
        }
        this.lastResult = await this.check();
        return this.lastResult.healthy;
    }
}
