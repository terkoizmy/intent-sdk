/**
 * Tests — Phase F: Liquidity Agent
 *
 * Unit tests for LiquidityAgent, covering:
 *   - initialize()
 *   - canSolve() (true/false scenarios)
 *   - getQuote()
 *   - solve() success flow (simulate mode)
 *   - solve() failure flow (lock released)
 *   - start() / stop()
 *   - getStatus()
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { LiquidityAgent } from "../../src/solver/agent/liquidity-agent";
import { buildAgentConfig, type LiquidityAgentConfig } from "../../src/solver/agent/agent-config";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { PricingResult } from "../../src/solver/types/pricing";
import type { Address, ChainId, Hash } from "../../src/types/common";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const USDC = 1_000_000n; // 6 decimals
const SOLVER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const USER_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;

// ─────────────────────────────────────────────
// Mock Factories
// ─────────────────────────────────────────────

function mockWalletManager() {
    return {
        getAddress: () => SOLVER_ADDRESS,
        signMessage: async (msg: string) => "0xfakesig",
        getSigner: (chainId: ChainId) => ({
            getAddress: () => SOLVER_ADDRESS,
            signMessage: async (msg: string | Uint8Array) => "0xfakesig",
        }),
        getPrivateKey: () => "0x0000000000000000000000000000000000000000000000000000000000000001",
    } as any;
}

function mockInventoryManager(opts: {
    canFulfill?: boolean;
    balance?: bigint;
    totalBalance?: bigint;
} = {}) {
    const { canFulfill = true, balance = 5000n * USDC, totalBalance = 10000n * USDC } = opts;
    let locked = false;
    let deducted = false;
    let unlocked = false;

    return {
        loadBalances: async () => { },
        getBalance: (_chainId: ChainId, _token: string) => balance,
        getTotalBalance: (_token: string) => totalBalance,
        canFulfill: (_chainId: ChainId, _token: string, _amount: bigint) => canFulfill,
        lockAmount: (_chainId: ChainId, _token: string, _amount: bigint, _intentId: string) => {
            locked = true;
        },
        unlockAmount: (_chainId: ChainId, _token: string, _amount: bigint, _intentId: string) => {
            unlocked = true;
        },
        confirmDeduction: (_chainId: ChainId, _token: string, _amount: bigint, _intentId: string) => {
            deducted = true;
        },
        getSnapshot: () => ({ balances: [], totalUSDValue: "0", timestamp: Date.now() }),
        // Test helpers
        get _locked() { return locked; },
        get _deducted() { return deducted; },
        get _unlocked() { return unlocked; },
    } as any;
}

function mockDynamicPricing(opts: {
    shouldReject?: boolean;
    pricing?: Partial<PricingResult>;
} = {}) {
    const { shouldReject = false } = opts;
    const defaultPricing: PricingResult = {
        baseFee: "5000000",
        gasCost: "1000000",
        slippageCapture: "2500000",
        totalFee: "8500000",
        userPays: "1000000000",
        userReceives: "991500000",
        solverProfit: "7500000",
        ...opts.pricing,
    };

    return {
        getPrice: (_intent: SolverIntent) => defaultPricing,
        getInventoryMultiplier: (_chainId: ChainId, _amount: bigint, _token?: string) => 1.0,
        shouldReject: (_chainId: ChainId, _amount: bigint, _token?: string) => shouldReject,
    } as any;
}

function mockSettlementManager() {
    let settling = false;
    let watching = false;

    return {
        settleIntent: async (_intent: SolverIntent, _txHash: Hash) => {
            settling = true;
            return {
                intentId: _intent.intentId,
                solver: SOLVER_ADDRESS,
                targetTx: _txHash,
                status: "completed",
                startedAt: Math.floor(Date.now() / 1000),
                claimAttempts: 0,
            };
        },
        watchPendingSettlements: () => { watching = true; },
        stopWatching: () => { watching = false; },
        getSettlement: (_id: string) => undefined,
        getAllSettlements: () => [],
        // Test helpers
        get _settling() { return settling; },
        get _watching() { return watching; },
    } as any;
}

function buildMockIntent(overrides: Partial<SolverIntent> = {}): SolverIntent {
    return {
        intentId: "0x" + "aa".repeat(32),
        intentHash: "0x" + "bb".repeat(32) as Hash,
        user: USER_ADDRESS,
        signature: "0xfakesig",
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        status: "pending",
        solver: SOLVER_ADDRESS,
        receivedAt: Math.floor(Date.now() / 1000),
        parsedIntent: {
            intentType: "bridge",
            parameters: {
                nonce: "1",
                inputToken: "USDC",
                inputAmount: (1000n * USDC).toString(),
                sourceChain: "1",
                targetChain: "137",
                recipient: USER_ADDRESS,
            },
            constraints: {
                maxSlippage: 100,
            },
            confidence: 0.95,
            rawInput: "Bridge 1000 USDC from Ethereum to Polygon",
        },
        ...overrides,
    } as SolverIntent;
}

function buildConfig(overrides: Partial<LiquidityAgentConfig> = {}): LiquidityAgentConfig {
    return buildAgentConfig({
        agent: {
            name: "TestAgent",
            privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
            supportedChains: [1, 137] as ChainId[],
            supportedTokens: ["USDC"],
            mode: "simulate",
        },
        contractAddress: "0xContractAddress",
        ...overrides,
    });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("LiquidityAgent", () => {

    describe("initialize()", () => {
        test("should set agentAddress and status to idle", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );

            await agent.initialize();

            expect(agent.getAgentAddress()).toBe(SOLVER_ADDRESS);
            expect(agent.getStatus()).toBe("idle");
        });
    });

    describe("canSolve()", () => {
        let agent: LiquidityAgent;

        beforeEach(async () => {
            agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();
        });

        test("should return true for valid bridge intent", () => {
            const intent = buildMockIntent();
            expect(agent.canSolve(intent)).toBe(true);
        });

        test("should return false for non-bridge intent type", () => {
            const intent = buildMockIntent({
                parsedIntent: {
                    intentType: "send",
                    parameters: { inputToken: "USDC", inputAmount: "1000000000" },
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Send 1000 USDC",
                },
            } as any);
            expect(agent.canSolve(intent)).toBe(false);
        });

        test("should return false for unsupported chain", () => {
            const intent = buildMockIntent();
            intent.parsedIntent.parameters.targetChain = "42161"; // Arbitrum — not in config
            expect(agent.canSolve(intent)).toBe(false);
        });

        test("should return false for unsupported token", () => {
            const intent = buildMockIntent();
            intent.parsedIntent.parameters.inputToken = "WBTC";
            expect(agent.canSolve(intent)).toBe(false);
        });

        test("should return false for expired intent", () => {
            const intent = buildMockIntent({
                deadline: Math.floor(Date.now() / 1000) - 100, // 100 seconds ago
            });
            expect(agent.canSolve(intent)).toBe(false);
        });

        test("should return false when inventory cannot fulfill", () => {
            const agentNoInventory = new LiquidityAgent(
                mockInventoryManager({ canFulfill: false }),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            const intent = buildMockIntent();
            expect(agentNoInventory.canSolve(intent)).toBe(false);
        });
    });

    describe("getQuote()", () => {
        test("should return PricingResult with correct fee breakdown", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            const quote = agent.getQuote(intent);

            expect(quote.baseFee).toBe("5000000");
            expect(quote.gasCost).toBe("1000000");
            expect(quote.totalFee).toBe("8500000");
            expect(quote.solverProfit).toBe("7500000");
            expect(quote.userReceives).toBe("991500000");
        });
    });

    describe("solve()", () => {
        test("should complete full flow in simulate mode", async () => {
            const inventory = mockInventoryManager();
            const settlement = mockSettlementManager();

            const agent = new LiquidityAgent(
                inventory,
                mockDynamicPricing(),
                settlement,
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            const result = await agent.solve(intent);

            expect(result.success).toBe(true);
            expect(result.txHash).toBeDefined();
            expect(result.profit).toBe("7500000");
            expect(result.output).toBe("991500000");
            expect(result.metadata).toBeDefined();
            expect(result.metadata!.sourceChainId).toBe(1);
            expect(result.metadata!.targetChainId).toBe(137);
            expect(result.metadata!.feeBreakdown).toBeDefined();

            // Inventory was locked then deducted (not unlocked)
            expect(inventory._locked).toBe(true);
            expect(inventory._deducted).toBe(true);
            expect(inventory._unlocked).toBe(false);
        });

        test("should release lock on sendOnTargetChain failure", async () => {
            const inventory = mockInventoryManager();

            // Create agent in live mode so sendOnTargetChain throws
            const agent = new LiquidityAgent(
                inventory,
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig({
                    agent: {
                        name: "TestAgent",
                        privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
                        supportedChains: [1, 137] as ChainId[],
                        supportedTokens: ["USDC"],
                        mode: "live",
                    }
                }),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            const result = await agent.solve(intent);

            // Should fail because live mode is not fully implemented
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();

            // Inventory lock should have been released
            expect(inventory._locked).toBe(true);    // Was locked...
            expect(inventory._unlocked).toBe(true);  // ...then unlocked on failure
            expect(inventory._deducted).toBe(false);  // Not deducted (failed)
        });

        test("should return error for non-bridge intent", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent({
                parsedIntent: {
                    intentType: "swap",
                    parameters: {},
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Swap tokens",
                },
            } as any);

            const result = await agent.solve(intent);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unsupported");
        });

        test("should return error for insufficient inventory", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager({ canFulfill: false }),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            const result = await agent.solve(intent);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Insufficient inventory");
        });

        test("should return error when dynamic pricing rejects", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing({ shouldReject: true }),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            const result = await agent.solve(intent);

            expect(result.success).toBe(false);
            expect(result.error).toContain("rejected");
        });
    });

    describe("start() / stop()", () => {
        test("should set status to processing on start and idle on stop", async () => {
            const settlement = mockSettlementManager();
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                settlement,
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();
            expect(agent.getStatus()).toBe("idle");

            agent.start();
            expect(agent.getStatus()).toBe("processing");
            expect(settlement._watching).toBe(true);

            agent.stop();
            expect(agent.getStatus()).toBe("idle");
            expect(settlement._watching).toBe(false);
        });
    });

    describe("getStatus()", () => {
        test("should return idle after initialization", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();
            expect(agent.getStatus()).toBe("idle");
        });

        test("should return idle after successful solve", async () => {
            const agent = new LiquidityAgent(
                mockInventoryManager(),
                mockDynamicPricing(),
                mockSettlementManager(),
                mockWalletManager(),
                buildConfig(),
            );
            await agent.initialize();

            const intent = buildMockIntent();
            await agent.solve(intent);
            expect(agent.getStatus()).toBe("idle");
        });
    });
});
