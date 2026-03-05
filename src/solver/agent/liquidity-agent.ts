/**
 * Liquidity Agent — Phase F
 *
 * Core orchestrator that ties together all solver subsystems
 * (Inventory, Pricing, Settlement) into a single agent that can
 * evaluate, price, and solve cross-chain bridge intents.
 *
 * Lifecycle:
 *   1. new LiquidityAgent(deps, config)
 *   2. await agent.initialize()   → loads balances, derives address
 *   3. agent.start()              → begins watching settlements
 *   4. await agent.solve(intent)  → full solve cycle
 *   5. agent.stop()               → cleanup
 *
 * Used by: SDK consumer (examples/autonomous-agent.ts, Phase K)
 */

import type { Address, ChainId, Hash } from "../../types/common";
import type { AgentStatus, SolutionResult, SolutionMetadata } from "../types/agent";
import type { SolverIntent, BridgeIntent } from "../types/intent";
import { toBridgeIntent } from "../types/intent";
import type { PricingResult } from "../types/pricing";
import type { InventoryManager } from "../inventory/inventory-manager";
import type { DynamicPricing } from "../pricing/dynamic-pricing";
import type { SettlementManager } from "../settlement/settlement-manager";
import type { WalletManager } from "../../shared/wallet-manager/wallet-manager";
import { UnsupportedIntentError, IntentExpiredError } from "../../errors/solver-errors";
import type { LiquidityAgentConfig } from "./agent-config";
import { encodeTransferData } from "../../shared/utils/erc20-utils";

// ─────────────────────────────────────────────
// LiquidityAgent
// ─────────────────────────────────────────────

export class LiquidityAgent {
    private status: AgentStatus = "idle";
    private agentAddress: Address | null = null;
    /** Number of intents currently being solved concurrently */
    private activeSolves: number = 0;

    constructor(
        private readonly inventoryManager: InventoryManager,
        private readonly dynamicPricing: DynamicPricing,
        private readonly settlementManager: SettlementManager,
        private readonly walletManager: WalletManager,
        private readonly config: LiquidityAgentConfig,
    ) { }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Initialize the agent: load on-chain balances and derive the agent address.
     *
     * Must be called before solve() / canSolve() / getQuote().
     */
    async initialize(): Promise<void> {
        this.agentAddress = this.walletManager.getAddress();
        await this.inventoryManager.loadBalances();
        this.status = "idle";
    }

    /**
     * Check whether this agent can solve a given intent.
     *
     * Validation order:
     *   1. Intent type must be "bridge"
     *   2. Source and target chains must be in supportedChains
     *   3. Token must be in supportedTokens
     *   4. Intent must not be expired (deadline > now)
     *   5. Inventory must have enough to fulfill (canFulfill)
     *
     * @param intent - SolverIntent to evaluate
     * @returns true if solvable, false otherwise
     */
    canSolve(intent: SolverIntent): boolean {
        // 1. Type check
        if (intent.parsedIntent.intentType !== "bridge") return false;

        // 2. Extract bridge params
        const bridgeIntent = toBridgeIntent(intent);
        if (!bridgeIntent) return false;

        // 3. Chain support
        const { supportedChains, supportedTokens } = this.config.agent;
        if (!supportedChains.includes(bridgeIntent.sourceChain)) return false;
        if (!supportedChains.includes(bridgeIntent.targetChain)) return false;

        // 4. Token support
        if (!supportedTokens.includes(bridgeIntent.token.toUpperCase())) return false;

        // 5. Expiry check
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (intent.deadline <= nowSeconds) return false;

        // 6. Inventory sufficiency on target chain
        const amount = BigInt(bridgeIntent.amount);
        if (!this.inventoryManager.canFulfill(bridgeIntent.targetChain, bridgeIntent.token, amount)) {
            return false;
        }

        return true;
    }

    /**
     * Get a price quote for a given intent via the DynamicPricing engine.
     *
     * Does NOT lock inventory or execute anything.
     *
     * @param intent - SolverIntent to price
     * @returns PricingResult with full fee breakdown
     */
    getQuote(intent: SolverIntent): PricingResult {
        return this.dynamicPricing.getPrice(intent);
    }

    /**
     * Full solve cycle for a single intent.
     *
     * Steps:
     *   1. Validate via canSolve()
     *   2. Price via getQuote()
     *   3. Check profitability (shouldReject)
     *   4. Lock inventory on target chain
     *   5. Send funds on target chain (simulate or live)
     *   6. Confirm deduction from inventory
     *   7. Trigger settlement (proof + claim)
     *   8. Return SolutionResult
     *
     * On any failure after lock, inventory is unlocked automatically.
     *
     * @param intent - SolverIntent to solve
     * @returns SolutionResult with success/error details
     */
    async solve(intent: SolverIntent): Promise<SolutionResult> {
        const startTime = Date.now();

        // B14: Enforce maxConcurrentIntents
        const maxConcurrent = this.config.agent.maxConcurrentIntents ?? 5;
        if (this.activeSolves >= maxConcurrent) {
            return {
                success: false,
                error: `Max concurrent intents reached (${maxConcurrent}). Try again later.`,
            };
        }

        this.activeSolves++;
        this.status = "processing";
        try {

            // 1. Validate
            if (intent.parsedIntent.intentType !== "bridge") {
                throw new UnsupportedIntentError(intent.parsedIntent.intentType, "Only bridge intents are supported");
            }

            const bridgeIntent = toBridgeIntent(intent);
            if (!bridgeIntent) {
                throw new UnsupportedIntentError("bridge", "Invalid bridge parameters");
            }

            // Check expiry
            const nowSeconds = Math.floor(Date.now() / 1000);
            if (intent.deadline <= nowSeconds) {
                throw new IntentExpiredError(intent.intentId, intent.deadline);
            }

            // Check inventory can fulfill
            const amount = BigInt(bridgeIntent.amount);
            if (!this.inventoryManager.canFulfill(bridgeIntent.targetChain, bridgeIntent.token, amount)) {
                return this.errorResult("Insufficient inventory on target chain", startTime, bridgeIntent);
            }

            // 2. Price
            const pricing = this.getQuote(intent);

            // 3. Check profitability
            if (this.dynamicPricing.shouldReject(bridgeIntent.targetChain, amount, bridgeIntent.token)) {
                return this.errorResult("Inventory too low — rejected by dynamic pricing", startTime, bridgeIntent);
            }

            // 4. Lock inventory
            this.inventoryManager.lockAmount(
                bridgeIntent.targetChain,
                bridgeIntent.token,
                amount,
                intent.intentId,
            );

            let targetTxHash: Hash;

            try {
                // 5. Send on target chain
                targetTxHash = await this.sendOnTargetChain(intent, bridgeIntent, pricing);

                // 6. Confirm deduction
                this.inventoryManager.confirmDeduction(
                    bridgeIntent.targetChain,
                    bridgeIntent.token,
                    amount,
                    intent.intentId,
                );
            } catch (sendError: unknown) {
                // Unlock on failure
                this.inventoryManager.unlockAmount(
                    bridgeIntent.targetChain,
                    bridgeIntent.token,
                    amount,
                    intent.intentId,
                );
                const msg = sendError instanceof Error ? sendError.message : String(sendError);
                return this.errorResult(
                    `Send failed: ${msg}`,
                    startTime,
                    bridgeIntent,
                );
            }

            // B9: Re-check deadline before settlement to prevent race conditions
            const nowBeforeSettle = Math.floor(Date.now() / 1000);
            if (intent.deadline <= nowBeforeSettle) {
                console.warn(
                    `Intent ${intent.intentId} deadline expired mid-solve — skipping settlement (funds already sent).`,
                );
            } else {
                // 7. Trigger settlement
                try {
                    await this.settlementManager.settleIntent(intent, targetTxHash);
                } catch (settlementError: unknown) {
                    // Settlement failure is non-fatal for the solve result —
                    // the funds were already sent to the user. Settlement will be retried
                    // by the watcher. Log but don't fail the result.
                    const msg = settlementError instanceof Error ? settlementError.message : String(settlementError);
                    console.warn(
                        `Settlement for ${intent.intentId} deferred: ${msg}`,
                    );
                }
            }
            // 8. Build success result
            const durationMs = Date.now() - startTime;

            this.status = "idle";
            this.activeSolves = Math.max(0, this.activeSolves - 1);
            return {
                success: true,
                txHash: targetTxHash,
                profit: pricing.solverProfit,
                output: pricing.userReceives,
                metadata: {
                    solveDurationMs: durationMs,
                    sourceChainId: bridgeIntent.sourceChain,
                    targetChainId: bridgeIntent.targetChain,
                    feeBreakdown: {
                        baseFee: pricing.baseFee,
                        slippageCapture: pricing.slippageCapture,
                        gasCost: pricing.gasCost,
                        totalFee: pricing.totalFee,
                    },
                },
            };
        } catch (error: unknown) {
            this.status = "idle";
            this.activeSolves = Math.max(0, this.activeSolves - 1);
            const msg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: msg,
            };
        }
    }

    /**
     * Start the agent: begin watching for pending settlements.
     *
     * @param _mempoolUrl - Reserved for Phase G mempool integration
     */
    start(_mempoolUrl?: string): void {
        this.status = "processing";
        this.settlementManager.watchPendingSettlements();
    }

    /**
     * Stop the agent: stop settlement watcher.
     */
    stop(): void {
        this.settlementManager.stopWatching();
        this.status = "idle";
    }

    /**
     * Get the current agent status.
     */
    getStatus(): AgentStatus {
        return this.status;
    }

    /**
     * Get the agent's on-chain address.
     */
    getAgentAddress(): Address | null {
        return this.agentAddress;
    }

    // ─────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────

    /**
     * Send funds to the intent recipient on the target chain.
     *
     * In **simulate** mode: generates a fake txHash from the intentId.
     * In **live** mode: executes a real ERC-20 transfer via WalletManager.
     *
     * @param intent       - The intent being solved
     * @param bridgeIntent - Extracted bridge parameters
     * @param _pricing     - Pricing result (reserved for future gas limit calc)
     * @returns Target chain transaction hash
     */
    private async sendOnTargetChain(
        intent: SolverIntent,
        bridgeIntent: BridgeIntent,
        _pricing: PricingResult,
    ): Promise<Hash> {
        if (this.config.agent.mode === "simulate") {
            // Simulate: generate deterministic fake hash
            const ramdomHex = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
            const fakeHash = `0x${ramdomHex.padEnd(64, "0").slice(0, 64)}`;
            return fakeHash as Hash;
        }

        // Live mode: build and send ERC-20 transfer
        const tokenAddress = intent.parsedIntent.parameters.outputTokenAddress || intent.parsedIntent.parameters.inputTokenAddress;

        if (!tokenAddress) {
            throw new Error(`Token address required for live mode transfer (${bridgeIntent.token})`);
        }

        // Generate calldata using custom ERC-20 utils
        const data = encodeTransferData(bridgeIntent.recipient, BigInt(_pricing.userReceives));


        // Sign and broadcast the transaction via the WalletManager
        const txHash = await this.walletManager.sendTransaction(
            bridgeIntent.targetChain,
            {
                to: tokenAddress as Address,
                data,
                value: 0n,
            },
        );


        return txHash as Hash;
    }

    /**
     * Build an error SolutionResult.
     */
    private errorResult(
        message: string,
        startTime: number,
        bridgeIntent?: BridgeIntent,
    ): SolutionResult {
        this.status = "idle";
        const result: SolutionResult = {
            success: false,
            error: message,
        };

        if (bridgeIntent) {
            result.metadata = {
                solveDurationMs: Date.now() - startTime,
                sourceChainId: bridgeIntent.sourceChain,
                targetChainId: bridgeIntent.targetChain,
            };
        }

        return result;
    }
}
