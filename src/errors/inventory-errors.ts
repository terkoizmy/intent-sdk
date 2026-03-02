/**
 * Inventory Errors
 *
 * Errors specific to inventory management operations.
 */

import type { ChainId } from "../types/common";

/**
 * Base error class for inventory-related errors
 */
export class InventoryError extends Error {
    public readonly code: string;

    constructor(message: string, code: string = "INVENTORY_ERROR") {
        super(message);
        this.name = "InventoryError";
        this.code = code;
    }
}

/**
 * Thrown when trying to lock more inventory than available
 */
export class InventoryLockError extends InventoryError {
    public readonly intentId: string;

    constructor(intentId: string, message?: string) {
        super(
            message ?? `Failed to lock inventory for intent ${intentId}`,
            "INVENTORY_LOCK_FAILED",
        );
        this.name = "InventoryLockError";
        this.intentId = intentId;
    }
}

/**
 * Thrown when a rebalancing operation fails
 */
export class RebalancingFailedError extends InventoryError {
    public readonly fromChain: ChainId;
    public readonly toChain: ChainId;
    public readonly amount: string;
    public readonly reason: string;

    constructor(
        fromChain: ChainId,
        toChain: ChainId,
        amount: string,
        reason: string,
    ) {
        super(
            `Rebalancing failed: ${amount} from chain ${fromChain} to chain ${toChain} — ${reason}`,
            "REBALANCING_FAILED",
        );
        this.name = "RebalancingFailedError";
        this.fromChain = fromChain;
        this.toChain = toChain;
        this.amount = amount;
        this.reason = reason;
    }
}
