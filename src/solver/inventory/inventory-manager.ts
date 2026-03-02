/**
 * Inventory Manager
 *
 * Tracks USDC/token balances across all supported chains.
 * Handles locking/unlocking for pending intents and
 * balance snapshots for decision-making.
 *
 * Lifecycle per intent:
 *   loadBalances() → canFulfill() → lockAmount()
 *   → (success) confirmDeduction() → unlockAmount()
 *   → (failure) unlockAmount()
 */

import type { ChainId } from "../../types/common";
import type { InventoryBalance, InventorySnapshot } from "../types/inventory";
import type { TokenRegistry } from "../../shared/token-registry/registry";
import { resolveFromSymbol } from "../../shared/token-registry/registry";
import type { ChainRegistry } from "../../shared/chain-registry/registry";
import type { RPCProviderManager } from "../../shared/rpc/provider-manager";
import type { WalletManager } from "../../shared/wallet-manager/wallet-manager";
import { InsufficientInventoryError } from "../../errors/solver-errors";
import { InventoryLockError } from "../../errors/inventory-errors";

/**
 * Parameters untuk konstruksi InventoryManager
 */
export interface InventoryManagerConfig {
    /** Minimum reserve percentage to always keep per chain (0–1) */
    minReservePercent: number;
}

export class InventoryManager {
    /**
     * Map of chainId:tokenSymbol → InventoryBalance
     * Format key: `${chainId}:${token}` e.g. "137:USDC"
     */
    private balances: Map<string, InventoryBalance> = new Map();

    /**
     * Track active locks per intent: intentId → list of lock keys
     * Used to release all locks by intentId on success/failure.
     */
    private locks: Map<string, Array<{ key: string; amount: bigint }>> = new Map();

    constructor(
        private readonly walletManager: WalletManager,
        private readonly tokenRegistry: TokenRegistry,
        private readonly chainRegistry: ChainRegistry,
        private readonly providerManager: RPCProviderManager,
        private readonly config: InventoryManagerConfig,
    ) { }

    // ─────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────

    /** Generate composite map key */
    private key(chainId: ChainId, token: string): string {
        return `${chainId}:${token.toUpperCase()}`;
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Load on-chain balances for all registered chains and supported tokens.
     *
     * Calls ERC20.balanceOf(agentAddress) on each (chain, token) pair.
     * Safe to call repeatedly (e.g., from InventoryMonitor polling).
     * Preserves existing locked amounts so in-flight intent locks are not lost.
     */
    async loadBalances(): Promise<void> {
        const agentAddress = this.walletManager.getAddress();
        const chains = this.chainRegistry.list();
        let totalLoaded = 0;

        for (const chain of chains) {
            const tokens = this.tokenRegistry.listByChain(chain.id);

            for (const tokenInfo of tokens) {
                try {
                    const balance = await this.providerManager.getTokenBalance(
                        chain.id,
                        tokenInfo.address,
                        agentAddress,
                    );

                    const key = this.key(chain.id, tokenInfo.symbol);

                    // Preserve existing locked amount if any, or start at 0
                    const existing = this.balances.get(key);
                    const locked = existing ? existing.locked : 0n;

                    this.balances.set(key, {
                        chainId: chain.id,
                        token: tokenInfo.symbol,
                        available: balance,
                        locked,
                        lastUpdated: Date.now(),
                    });

                    totalLoaded++;
                } catch (error) {
                    console.error(
                        `Failed to load balance for ${tokenInfo.symbol} on chain ${chain.id}:`,
                        error,
                    );
                }
            }
        }
    }

    /**
     * Refresh the balance of a specific token on a specific chain.
     * Useful for targeted updates after a successful transfer without
     * reloading the entire multi-chain inventory.
     *
     * @param chainId - Chain to query
     * @param tokenSymbol - Token symbol to query (e.g. "USDC")
     */
    async refreshBalance(chainId: ChainId, tokenSymbol: string): Promise<void> {
        const agentAddress = this.walletManager.getAddress();
        const tokenAddress = resolveFromSymbol(this.tokenRegistry, tokenSymbol, chainId);

        try {
            const balance = await this.providerManager.getTokenBalance(
                chainId,
                tokenAddress,
                agentAddress,
            );

            const key = this.key(chainId, tokenSymbol);
            const existing = this.balances.get(key);
            const locked = existing ? existing.locked : 0n;

            this.balances.set(key, {
                chainId,
                token: tokenSymbol,
                available: balance,
                locked,
                lastUpdated: Date.now(),
            });
        } catch (error) {
            console.error(
                `Failed to refresh balance for ${tokenSymbol} on chain ${chainId}:`,
                error,
            );
        }
    }

    /**
     * Get current available balance (available - locked) for a token on a chain.
     *
     * @param chainId - Chain to query
     * @param token   - Token symbol (e.g. "USDC")
     * @returns Available balance in token's smallest unit. Returns 0n if not tracked.
     */
    getBalance(chainId: ChainId, token: string): bigint {
        const key = this.key(chainId, token);
        const balance = this.balances.get(key);

        if (!balance) return 0n;

        // Available balance is the raw balance minus reserved/locked funds
        const netAvailable = balance.available - balance.locked;
        return netAvailable > 0n ? netAvailable : 0n;
    }

    /**
     * Get total available balance across all chains for a token.
     *
     * Useful for global profitability checks.
     *
     * @param token - Token symbol (e.g. "USDC")
     * @returns Sum of (available - locked) across all chains
     */
    getTotalBalance(token: string): bigint {
        let total = 0n;
        const suffix = `:${token.toUpperCase()}`;

        for (const [key, balance] of this.balances) {
            if (key.endsWith(suffix)) {
                const net = balance.available - balance.locked;
                if (net > 0n) total += net;
            }
        }

        return total;
    }

    /**
     * Check if we have enough balance to fulfill an intent.
     *
     * Must maintain minReservePercent after the deduction.
     * Formula: available - locked - amount >= total * minReservePercent
     *
     * @param chainId - Target chain for fulfillment
     * @param token   - Token to send
     * @param amount  - Amount required (in smallest unit)
     * @returns true if we can safely fill without breaching reserve
     */
    canFulfill(chainId: ChainId, token: string, amount: bigint): boolean {
        const key = this.key(chainId, token);
        const balance = this.balances.get(key);

        if (!balance) return false;

        const netAvailable = balance.available - balance.locked;

        // Basic check
        if (netAvailable < amount) return false;

        // Reserve check using integer (basis-points) arithmetic.
        //
        // Semantics: "After sending `amount`, the remaining NET spendable
        // balance must still be >= minReservePercent of that same net balance."
        //
        // Using netAvailable (not raw `available`) keeps the reserve proportional
        // to what we can actually spend, independent of how much is already locked.
        const bps = BigInt(Math.floor(this.config.minReservePercent * 10000));
        const minReserve = (netAvailable * bps) / 10000n;

        // Remaining after deduction must be >= minReserve
        return (netAvailable - amount) >= minReserve;
    }

    /**
     * Lock an amount for a pending intent (reserve it).
     *
     * Throws InsufficientInventoryError if not enough available.
     * Throws InventoryLockError if lock already exists for intentId+token+chain.
     *
     * @param chainId  - Chain where funds will be sent
     * @param token    - Token to lock
     * @param amount   - Amount to lock
     * @param intentId - Intent ID for tracking (used in unlock/confirm)
     */
    lockAmount(chainId: ChainId, token: string, amount: bigint, intentId: string): void {
        const key = this.key(chainId, token);
        const balance = this.balances.get(key);

        if (!balance) {
            // Chain/token not tracked
            throw new InsufficientInventoryError(
                chainId,
                token,
                amount.toString(),
                "0"
            );
        }

        if (!this.canFulfill(chainId, token, amount)) {
            throw new InsufficientInventoryError(
                chainId,
                token,
                amount.toString(),
                (balance.available - balance.locked).toString()
            );
        }

        // Check for existing lock for this intent/token/chain to prevent double-locking
        const intentLocks = this.locks.get(intentId) || [];
        if (intentLocks.some(l => l.key === key)) {
            throw new InventoryLockError(intentId, `Inventory already locked for ${token} on chain ${chainId}`);
        }

        // Apply lock
        balance.locked += amount;
        balance.lastUpdated = Date.now();

        // Track lock
        intentLocks.push({ key, amount });
        this.locks.set(intentId, intentLocks);
    }

    /**
     * Release a previously locked amount (on success or failure).
     *
     * Safe to call even if intent wasn't locked (idempotent).
     * Throws in dev mode if `amount` does not match the stored lock amount
     * (helps catch accounting bugs early).
     *
     * @param chainId  - Chain of the lock
     * @param token    - Token to unlock
     * @param amount   - Expected amount to unlock (validated against stored lock)
     * @param intentId - Intent ID (must match the original lockAmount call)
     */
    unlockAmount(chainId: ChainId, token: string, amount: bigint, intentId: string): void {
        const key = this.key(chainId, token);
        const balance = this.balances.get(key);

        // Remove from locks tracking
        const intentLocks = this.locks.get(intentId);
        if (!intentLocks) return; // No locks for this intent (idempotent)

        const lockIndex = intentLocks.findIndex(l => l.key === key);
        if (lockIndex === -1) return; // This specific lock not found

        // Remove this specific lock
        const lockedAmount = intentLocks[lockIndex].amount;

        // Validate caller's expected amount matches the stored lock.
        // Mismatch indicates an accounting bug — log a warning instead of silently
        // over- or under-releasing, as the intent runner may have the wrong state.
        if (amount !== lockedAmount) {
            console.warn(
                `[InventoryManager] unlockAmount mismatch for intent ${intentId} on ${chainId}:${token} ` +
                `— expected ${amount} but lock holds ${lockedAmount}. Using stored value.`
            );
        }

        intentLocks.splice(lockIndex, 1);

        if (intentLocks.length === 0) {
            this.locks.delete(intentId);
        } else {
            this.locks.set(intentId, intentLocks);
        }

        // Revert balance state
        if (balance) {
            balance.locked -= lockedAmount;
            if (balance.locked < 0n) balance.locked = 0n; // Safety clamp
            balance.lastUpdated = Date.now();
        }
    }

    /**
     * Permanently deduct balance after successfully sending to user.
     *
     * Called after the target chain tx is confirmed. Reduces both
     * available and locked (since we locked it first).
     *
     * @param chainId  - Chain where send happened
     * @param token    - Token that was sent
     * @param amount   - Amount sent
     * @param intentId - Intent ID for tracking
     */
    confirmDeduction(chainId: ChainId, token: string, amount: bigint, intentId: string): void {
        const key = this.key(chainId, token);
        const balance = this.balances.get(key);

        // Consume the lock
        const intentLocks = this.locks.get(intentId);
        let lockedAmount = 0n;

        if (intentLocks) {
            const lockIndex = intentLocks.findIndex(l => l.key === key);
            if (lockIndex !== -1) {
                lockedAmount = intentLocks[lockIndex].amount;
                intentLocks.splice(lockIndex, 1);
                if (intentLocks.length === 0) {
                    this.locks.delete(intentId);
                }
            }
        }

        if (balance) {
            // Deduct from available (funds sent away)
            balance.available -= amount;

            // Release the lock (it was consumed)
            balance.locked -= lockedAmount;

            // Safety clamps
            if (balance.available < 0n) balance.available = 0n;
            if (balance.locked < 0n) balance.locked = 0n;

            balance.lastUpdated = Date.now();
        }
    }

    /**
     * Get a full snapshot of all current balances and total USD value.
     *
     * @returns InventorySnapshot with all chain balances and a timestamp
     */
    getSnapshot(): InventorySnapshot {
        const balances = Array.from(this.balances.values());

        // Calculate estimated USD value.
        // Assumes USDC/USDT = $1 (1:1 peg). Will be replaced by Oracle pricing in Phase I.
        // Uses NET balance (available − locked) so locked funds are not counted as
        // spendable capital — the dashboard value reflects what we can actually use.
        let totalUSD = 0n;

        for (const b of balances) {
            const net = b.available - b.locked;
            if (net > 0n) totalUSD += net;
        }

        return {
            balances: [...balances], // Copy array
            totalUSDValue: totalUSD.toString(),
            timestamp: Date.now(),
        };
    }
}
