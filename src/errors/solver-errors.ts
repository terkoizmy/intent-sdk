/**
 * Solver Errors
 *
 * Domain-specific errors for the solver module.
 * All solver errors extend SolverError base class.
 */

import type { ChainId } from "../types/common";
import { getChainDisplayName } from "../shared/chain-registry/chain-names";

/**
 * Base error class for all solver-related errors
 */
export class SolverError extends Error {
    public readonly code: string;

    constructor(message: string, code: string = "SOLVER_ERROR") {
        super(message);
        this.name = "SolverError";
        this.code = code;
    }
}

/**
 * Thrown when solver doesn't have enough inventory to fulfill an intent.
 *
 * CONTOH:
 *   throw new InsufficientInventoryError(137, "USDC", "1000000000", "500000000")
 *   → "Insufficient USDC on chain 137: required 1000000000, available 500000000"
 */
export class InsufficientInventoryError extends SolverError {
    public readonly chainId: ChainId;
    public readonly token: string;
    public readonly required: string;
    public readonly available: string;

    constructor(
        chainId: ChainId,
        token: string,
        required: string,
        available: string,
    ) {
        super(
            `Insufficient ${token} on ${getChainDisplayName(chainId)}: required ${required}, available ${available}`,
            "INSUFFICIENT_INVENTORY",
        );
        this.name = "InsufficientInventoryError";
        this.chainId = chainId;
        this.token = token;
        this.required = required;
        this.available = available;
    }
}

/**
 * Thrown when an intent has passed its deadline
 */
export class IntentExpiredError extends SolverError {
    public readonly intentId: string;
    public readonly deadline: number;

    constructor(intentId: string, deadline: number) {
        super(
            `Intent ${intentId} expired: deadline was ${new Date(deadline * 1000).toISOString()}`,
            "INTENT_EXPIRED",
        );
        this.name = "IntentExpiredError";
        this.intentId = intentId;
        this.deadline = deadline;
    }
}

/**
 * Thrown when solver receives an intent type it cannot handle
 */
export class UnsupportedIntentError extends SolverError {
    public readonly intentType: string;
    public readonly reason: string;

    constructor(intentType: string, reason: string) {
        super(
            `Unsupported intent type "${intentType}": ${reason}`,
            "UNSUPPORTED_INTENT",
        );
        this.name = "UnsupportedIntentError";
        this.intentType = intentType;
        this.reason = reason;
    }
}
