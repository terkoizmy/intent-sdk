/**
 * Settlement Manager — Phase E
 *
 * Orchestrates the full settlement lifecycle:
 *   1. Solver sends funds on target chain → gets targetTxHash
 *   2. Wait for confirmations on target chain
 *   3. Generate proof (EIP-191 Oracle signature)
 *   4. Submit claim() on source chain contract
 *   5. Track settlement status and handle failures
 *
 * Retry policy: max 3 attempts per intent.
 * After 3 failures → status = "failed", requires manual review.
 *
 * Used by: LiquidityAgent.solve() (Phase F)
 */

import type { Address, Hash } from "../../types/common";
import type { Settlement, SettlementStatus } from "../types/settlement";
import { toBridgeIntent } from "../types/intent";
import type { SolverIntent } from "../types/intent";
import type { ProofGenerator } from "./proof-generator";
import type { ProofVerifier } from "./proof-verifier";
import type { IntentSettlementContract } from "../contracts/intent-settlement/intent-settlement";
import { SettlementError, ClaimFailedError, ProofGenerationError } from "../../errors/settlement-errors";
import { ethers } from "ethers";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

export interface SettlementConfig {
    /** Number of block confirmations before generating proof (default: 3) */
    requiredConfirmations: number;

    /** Max retry attempts for claim (default: 3) */
    maxClaimRetries: number;

    /** Interval (ms) for watchPendingSettlements polling (default: 30_000) */
    watchIntervalMs: number;

    /** Oracle address that signs the proof. If not provided, assumes solver is oracle (MVP). */
    oracleAddress?: Address;

    /**
     * Callback invoked when a settlement has permanently failed
     * (i.e., retries exhausted). Use this for alerting, logging to
     * external systems, or triggering manual recovery.
     */
    onPermanentFailure?: (intentId: string, error: string, attempts: number) => void;
}

export const DEFAULT_SETTLEMENT_CONFIG: SettlementConfig = {
    requiredConfirmations: 3,
    maxClaimRetries: 3,
    watchIntervalMs: 30_000,
};

// ─────────────────────────────────────────────
// SettlementManager
// ─────────────────────────────────────────────

export class SettlementManager {
    /** In-memory settlement records, keyed by intentId */
    private settlements: Map<string, Settlement> = new Map();

    /** Cache of original intents to allow retries */
    private intents: Map<string, SolverIntent> = new Map();

    /** Interval ID for watchPendingSettlements */
    private watchInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly proofGenerator: ProofGenerator,
        private readonly proofVerifier: ProofVerifier,
        private readonly contract: IntentSettlementContract,
        private readonly config: SettlementConfig = DEFAULT_SETTLEMENT_CONFIG,
    ) { }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Full settlement flow for a single intent.
     *
     * Steps:
     *   1. Create Settlement record with status "pending"
     *   2. Wait for confirmations on target chain
     *   3. Generate proof → status "proving"
     *   4. Verify proof off-chain (sanity check)
     *   5. Call contract.claim() → status "claiming"
     *   6. If success → status "completed"
     *   7. If failure → handleClaimFailure()
     *
     * @param intent - SolverIntent being settled
     * @param targetTxHash - Transaction hash of the fulfillment on target chain
     * @returns Settlement record
     * @throws SettlementError on unrecoverable failure
     */
    async settleIntent(
        intent: SolverIntent,
        targetTxHash: Hash,
    ): Promise<Settlement> {
        this.intents.set(intent.intentId, intent);

        let settlement = this.settlements.get(intent.intentId);
        if (!settlement) {
            settlement = {
                intentId: intent.intentId,
                solver: intent.solver || ("0x0000000000000000000000000000000000000000" as any),
                targetTx: targetTxHash,
                status: "pending",
                startedAt: Math.floor(Date.now() / 1000),
                claimAttempts: 0,
            };
            this.settlements.set(intent.intentId, settlement);
        }

        try {
            const bridgeIntent = toBridgeIntent(intent);
            if (!bridgeIntent) throw new SettlementError("Invalid bridge intent");
            // 1. Build CrossChainOrder first — needed to compute the on-chain intentId
            //    that the contract derives via keccak256(abi.encode(order)).
            //    The digest MUST use this on-chain intentId, NOT the SDK's string UUID.
            const tokenAddr = intent.parsedIntent.parameters.inputTokenAddress || ethers.ZeroAddress;
            const orderData = intent.parsedIntent.parameters.orderData
                || ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [tokenAddr, bridgeIntent.amount]);

            const nonceRaw = intent.parsedIntent.parameters.nonce;
            if (!nonceRaw) throw new SettlementError(`Intent ${intent.intentId} is missing required field 'nonce'`);

            const order = {
                settlementContract: await this.contract.getAddress(),
                swapper: intent.user,
                nonce: BigInt(nonceRaw),
                originChainId: bridgeIntent.sourceChain,
                initiateDeadline: intent.parsedIntent.parameters.initiateDeadline
                    ? Number(intent.parsedIntent.parameters.initiateDeadline)
                    : intent.deadline,
                fillDeadline: intent.deadline,
                orderData: orderData
            };


            // 2. Compute on-chain intentId = keccak256(abi.encode(order))
            //    This MUST match what IntentSettlement.sol computes in claim().
            const onChainIntentId = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    [
                        "tuple(address settlementContract, address swapper, uint256 nonce, uint32 originChainId, uint32 initiateDeadline, uint32 fillDeadline, bytes orderData)"
                    ],
                    [order]
                )
            ) as Hash;


            // 3. Generate Proof using the on-chain intentId
            //    Contract verifies: toEthSignedMessageHash(keccak256(abi.encodePacked(intentId, "FILLED", msg.sender)))
            settlement.status = "proving";
            const proof = await this.proofGenerator.generateSignatureProof({
                intentId: onChainIntentId,
                targetTxHash,
                targetChainId: bridgeIntent.targetChain,
                amount: bridgeIntent.amount,
                recipient: bridgeIntent.recipient,
                confirmations: this.config.requiredConfirmations
            });
            settlement.proof = proof;

            // 4. Verify Proof off-chain (sanity check before spending gas)
            const expectedOracle = this.config.oracleAddress || settlement.solver;
            const isValid = await this.proofVerifier.verifySignatureProof(proof, expectedOracle, settlement.solver);
            if (!isValid) {
                throw new ProofGenerationError(`Local proof verification failed for intent ${onChainIntentId}`);
            }

            // 5. Submit Claim
            settlement.status = "claiming";

            const tx = await this.contract.claim(order, proof.solverSignature);
            settlement.sourceTx = tx.hash as Hash;
            await tx.wait();
            settlement.status = "completed";
            settlement.settledAt = Math.floor(Date.now() / 1000);
            return settlement;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.handleClaimFailure(intent.intentId, msg);
            throw new ClaimFailedError(intent.intentId, msg);
        }
    }

    /**
     * Start watching for pending settlements and retry claims.
     *
     * Runs on an interval (default 30s). For each pending/failed settlement
     * with remaining retries, attempt to re-settle.
     */
    watchPendingSettlements(): void {
        if (this.watchInterval) return;

        this.watchInterval = setInterval(async () => {
            for (const settlement of this.settlements.values()) {
                if (settlement.status === "failed" && settlement.claimAttempts < this.config.maxClaimRetries) {
                    const intent = this.intents.get(settlement.intentId);
                    if (intent) {
                        try {
                            await this.settleIntent(intent, settlement.targetTx);
                        } catch (e: unknown) {
                            if (!(e instanceof ClaimFailedError)) {
                                console.error(`Unexpected error in watchPendingSettlements for ${settlement.intentId}:`, e);
                            }
                        }
                    }
                }
            }
        }, this.config.watchIntervalMs);
    }

    /**
     * Stop watching pending settlements.
     */
    stopWatching(): void {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
    }

    /**
     * Handle a claim failure: increment attempts, update status.
     *
     * If attempts < maxClaimRetries → keep status "failed" (will be retried by watcher)
     * If attempts >= maxClaimRetries → status "failed" permanently
     *
     * @param intentId - Intent whose claim failed
     * @param error - Error that caused the failure
     */
    async handleClaimFailure(intentId: string, errorMessage: string): Promise<void> {
        const settlement = this.settlements.get(intentId);
        if (!settlement) return;

        settlement.claimAttempts += 1;
        settlement.error = errorMessage;

        settlement.status = "failed";

        if (settlement.claimAttempts >= this.config.maxClaimRetries) {
            console.error(`Intent ${intentId} settlement failed permanently after ${settlement.claimAttempts} attempts. Error: ${errorMessage}`);

            // B8: Invoke onPermanentFailure callback if configured
            if (this.config.onPermanentFailure) {
                try {
                    this.config.onPermanentFailure(intentId, errorMessage, settlement.claimAttempts);
                } catch {
                    // Never let the callback crash the settlement manager
                }
            }
        } else {
            console.warn(`Intent ${intentId} claim failed, will retry. Error: ${errorMessage}`);
        }
    }

    // ─────────────────────────────────────────
    // Getters
    // ─────────────────────────────────────────

    /**
     * Get a settlement record by intentId.
     */
    getSettlement(intentId: string): Settlement | undefined {
        return this.settlements.get(intentId);
    }

    /**
     * Get all settlements with a specific status.
     */
    getSettlementsByStatus(status: SettlementStatus): Settlement[] {
        return Array.from(this.settlements.values()).filter(s => s.status === status);
    }

    /**
     * Get all settlement records.
     */
    getAllSettlements(): Settlement[] {
        return Array.from(this.settlements.values());
    }
}
