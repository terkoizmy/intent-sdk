/**
 * Settlement Errors
 *
 * Errors specific to cross-chain settlement and proof operations.
 */

/**
 * Base error class for settlement-related errors
 */
export class SettlementError extends Error {
    public readonly code: string;

    constructor(message: string, code: string = "SETTLEMENT_ERROR") {
        super(message);
        this.name = "SettlementError";
        this.code = code;
    }
}

/**
 * Thrown when proof generation fails (e.g., cannot sign, invalid data)
 */
export class ProofGenerationError extends SettlementError {
    constructor(message?: string) {
        super(
            message ?? "Failed to generate cross-chain proof",
            "PROOF_GENERATION_FAILED",
        );
        this.name = "ProofGenerationError";
    }
}

/**
 * Thrown when claim on source chain fails
 */
export class ClaimFailedError extends SettlementError {
    public readonly intentId: string;
    public readonly reason: string;

    constructor(intentId: string, reason: string) {
        super(
            `Claim failed for intent ${intentId}: ${reason}`,
            "CLAIM_FAILED",
        );
        this.name = "ClaimFailedError";
        this.intentId = intentId;
        this.reason = reason;
    }
}
