/**
 * Integration Tests — Phase L: Edge Cases
 *
 * Tests for failure modes, boundary conditions, and defensive behaviors
 * across the full Parser → Solver pipeline.
 *
 * All subsystems are mocked (no real RPC, no real blockchain).
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { IntentSolver } from "../../src/solver";
import { buildAgentConfig } from "../../src/solver/agent/agent-config";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { Address, ChainId, Hash } from "../../src/types/common";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const USDC = 1_000_000n;
const SOLVER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const USER_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;

// ─────────────────────────────────────────────
// Mock Factories
// ─────────────────────────────────────────────

function mockWalletManager() {
    return {
        getAddress: () => SOLVER_ADDRESS,
        signMessage: async (_msg: string) => "0xfakesig",
        getSigner: (_chainId: ChainId) => ({
            getAddress: () => SOLVER_ADDRESS,
            signMessage: async (_msg: string | Uint8Array) => "0xfakesig",
        }),
        getPrivateKey: () => "0x0000000000000000000000000000000000000000000000000000000000000001",
    } as any;
}

function mockInventoryManager(opts: { canFulfill?: boolean; balance?: bigint } = {}) {
    const { canFulfill = true, balance = 50_000n * USDC } = opts;
    const locks: string[] = [];
    const unlocks: string[] = [];
    const deductions: string[] = [];

    return {
        loadBalances: async () => { },
        getBalance: (_chainId: ChainId, _token: string) => balance,
        getTotalBalance: (_token: string) => balance * 3n,
        canFulfill: (_chainId: ChainId, _token: string, _amount: bigint) => canFulfill,
        lockAmount: (_chainId: ChainId, _token: string, _amount: bigint, intentId: string) => {
            locks.push(intentId);
        },
        unlockAmount: (_chainId: ChainId, _token: string, _amount: bigint, intentId: string) => {
            unlocks.push(intentId);
        },
        confirmDeduction: (_chainId: ChainId, _token: string, _amount: bigint, intentId: string) => {
            deductions.push(intentId);
        },
        getSnapshot: () => ({ balances: {}, totalValueUsd: "0", timestamp: Date.now() }),
        get _locks() { return locks; },
        get _unlocks() { return unlocks; },
        get _deductions() { return deductions; },
    } as any;
}

function mockDynamicPricing(opts: { shouldReject?: boolean } = {}) {
    return {
        getPrice: () => ({
            baseFee: "500000", gasCost: "100000", slippageCapture: "250000",
            totalFee: "850000", userPays: "100000000", userReceives: "99150000",
            solverProfit: "750000",
        }),
        getInventoryMultiplier: () => 1.0,
        shouldReject: () => opts.shouldReject ?? false,
    } as any;
}

function mockSettlementManager(opts: { shouldFail?: boolean } = {}) {
    return {
        settleIntent: async (_intent: SolverIntent, _txHash: Hash) => {
            if (opts.shouldFail) throw new Error("Settlement contract unreachable");
            return { intentId: _intent.intentId, status: "completed", claimAttempts: 1 };
        },
        watchPendingSettlements: () => { },
        stopWatching: () => { },
        getSettlement: () => undefined,
        getAllSettlements: () => [],
    } as any;
}

function mockMempoolMonitor() {
    return {
        start: () => { },
        stop: () => { },
        getStats: () => ({ received: 0, filtered: 0, solved: 0, failed: 0 }),
    } as any;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildValidBridgeIntent(overrides: Partial<SolverIntent> = {}): SolverIntent {
    return {
        intentId: "test-intent-" + Math.random().toString(36).slice(2),
        intentHash: ("0x" + "cc".repeat(32)) as Hash,
        user: USER_ADDRESS,
        signature: "0xfakesig",
        deadline: Math.floor(Date.now() / 1000) + 3600,
        status: "pending",
        receivedAt: Math.floor(Date.now() / 1000),
        solver: SOLVER_ADDRESS,
        parsedIntent: {
            intentType: "bridge",
            parameters: {
                sourceChain: "1",
                targetChain: "42161",
                inputToken: "USDC",
                inputAmount: (100n * USDC).toString(),
                recipient: USER_ADDRESS,
            },
            constraints: { maxSlippage: 50 },
            confidence: 0.95,
            rawInput: "Bridge 100 USDC to Arbitrum",
        },
        ...overrides,
    } as SolverIntent;
}

function buildTestSolver(opts: {
    inventoryMgr?: any;
    settlementMgr?: any;
    pricingMgr?: any;
    supportedChains?: ChainId[];
    supportedTokens?: string[];
    mode?: "simulate" | "live";
} = {}) {
    const config = buildAgentConfig({
        agent: {
            name: "EdgeCaseTestAgent",
            privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
            supportedChains: opts.supportedChains ?? [1, 42161] as ChainId[],
            supportedTokens: opts.supportedTokens ?? ["USDC"],
            mode: opts.mode ?? "simulate",
        },
        contractAddress: "0x0000000000000000000000000000000000000000",
    });

    const solver = new IntentSolver(config as any);
    (solver as any).walletManager = mockWalletManager();
    (solver as any).inventoryManager = opts.inventoryMgr ?? mockInventoryManager();
    (solver as any).dynamicPricing = opts.pricingMgr ?? mockDynamicPricing();
    (solver as any).settlementManager = opts.settlementMgr ?? mockSettlementManager();
    (solver as any).profitTracker = {
        recordAttempt: () => { }, recordResult: () => { },
        getStats: () => ({ totalAttempts: 0, totalSuccesses: 0, totalFailures: 0, totalProfit: "0", averageProfit: "0", roi: "0" }),
    };
    (solver as any).mempoolMonitor = mockMempoolMonitor();

    (solver.agent as any).inventoryManager = (solver as any).inventoryManager;
    (solver.agent as any).dynamicPricing = (solver as any).dynamicPricing;
    (solver.agent as any).settlementManager = (solver as any).settlementManager;
    (solver.agent as any).walletManager = (solver as any).walletManager;

    return solver;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("Edge Cases — Integration", () => {

    describe("Expired Intent", () => {
        test("should reject canSolve for intent past deadline", async () => {
            const intent = buildValidBridgeIntent({
                deadline: Math.floor(Date.now() / 1000) - 300,  // 5 minutes ago
            });

            const solver = buildTestSolver();
            await solver.initialize();

            expect(solver.canSolve(intent)).toBe(false);
        });

        test("solve() should return error for expired intent", async () => {
            const intent = buildValidBridgeIntent({
                deadline: Math.floor(Date.now() / 1000) - 1,  // just expired
            });

            const solver = buildTestSolver();
            await solver.initialize();
            console.log(intent, "intent")
            const result = await solver.solve(intent);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("Insufficient Inventory", () => {
        test("canSolve() should return false when canFulfill is false", async () => {
            const inventory = mockInventoryManager({ canFulfill: false });
            const solver = buildTestSolver({ inventoryMgr: inventory });
            await solver.initialize();

            const intent = buildValidBridgeIntent();
            expect(solver.canSolve(intent)).toBe(false);
        });

        test("solve() should return error and not lock inventory", async () => {
            const inventory = mockInventoryManager({ canFulfill: false });
            const solver = buildTestSolver({ inventoryMgr: inventory });
            await solver.initialize();

            const intent = buildValidBridgeIntent();
            const result = await solver.solve(intent);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Insufficient inventory");
            expect(inventory._locks).toHaveLength(0);
        });
    });

    describe("Dynamic Pricing Rejection", () => {
        test("solve() should reject when dynamic pricing says shouldReject", async () => {
            const pricing = mockDynamicPricing({ shouldReject: true });
            const inventory = mockInventoryManager();
            const solver = buildTestSolver({ pricingMgr: pricing, inventoryMgr: inventory });
            await solver.initialize();

            const intent = buildValidBridgeIntent();
            const result = await solver.solve(intent);

            expect(result.success).toBe(false);
            expect(result.error).toContain("rejected");

            // shouldReject is called BEFORE lockAmount in LiquidityAgent solve flow
            // so no lock should have been acquired
            expect(inventory._locks).toHaveLength(0);
            expect(inventory._unlocks).toHaveLength(0);
            expect(inventory._deductions).toHaveLength(0);
        });
    });

    describe("Unsupported Chain", () => {
        test("canSolve() returns false for sourceChain not in supportedChains", async () => {
            const solver = buildTestSolver({ supportedChains: [1, 42161] as ChainId[] });
            await solver.initialize();

            const intent = buildValidBridgeIntent({
                parsedIntent: {
                    intentType: "bridge",
                    parameters: {
                        sourceChain: "137",  // Polygon — not supported
                        targetChain: "42161",
                        inputToken: "USDC",
                        inputAmount: "100000000",
                        recipient: USER_ADDRESS,
                    },
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Bridge 100 USDC from Polygon to Arbitrum",
                },
            });

            expect(solver.canSolve(intent)).toBe(false);
        });

        test("canSolve() returns false for targetChain not in supportedChains", async () => {
            const solver = buildTestSolver({ supportedChains: [1, 42161] as ChainId[] });
            await solver.initialize();

            const intent = buildValidBridgeIntent({
                parsedIntent: {
                    intentType: "bridge",
                    parameters: {
                        sourceChain: "1",
                        targetChain: "56",  // BSC — not supported
                        inputToken: "USDC",
                        inputAmount: "100000000",
                        recipient: USER_ADDRESS,
                    },
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Bridge 100 USDC to BSC",
                },
            });

            expect(solver.canSolve(intent)).toBe(false);
        });
    });

    describe("Unsupported Token", () => {
        test("canSolve() returns false for WBTC when only USDC is supported", async () => {
            const solver = buildTestSolver({ supportedTokens: ["USDC"] });
            await solver.initialize();

            const intent = buildValidBridgeIntent({
                parsedIntent: {
                    intentType: "bridge",
                    parameters: {
                        sourceChain: "1",
                        targetChain: "42161",
                        inputToken: "WBTC",
                        inputAmount: "100000",
                        recipient: USER_ADDRESS,
                    },
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Bridge 1 WBTC to Arbitrum",
                },
            });

            expect(solver.canSolve(intent)).toBe(false);
        });
    });

    describe("Missing Parameters", () => {
        test("solve() returns error when recipient is missing", async () => {
            const solver = buildTestSolver();
            await solver.initialize();

            const intent = buildValidBridgeIntent({
                parsedIntent: {
                    intentType: "bridge",
                    parameters: {
                        sourceChain: "1",
                        targetChain: "42161",
                        inputToken: "USDC",
                        inputAmount: "100000000",
                        // recipient is missing
                    },
                    constraints: {},
                    confidence: 0.8,
                    rawInput: "Bridge 100 USDC to Arbitrum",
                },
            });

            const result = await solver.solve(intent);
            expect(result.success).toBe(false);
        });

        test("solve() returns error when non-bridge intentType is passed", async () => {
            const solver = buildTestSolver();
            await solver.initialize();

            const intent = buildValidBridgeIntent({
                parsedIntent: {
                    intentType: "swap",
                    parameters: { inputToken: "USDC", outputToken: "ETH" },
                    constraints: {},
                    confidence: 0.9,
                    rawInput: "Swap USDC for ETH",
                },
            });

            const result = await solver.solve(intent);
            expect(result.success).toBe(false);
            expect(result.error).toContain("Unsupported");
        });
    });

    describe("Concurrent Solves", () => {
        test("should handle two intents solved in parallel without errors", async () => {
            const inventory = mockInventoryManager();
            const solver = buildTestSolver({ inventoryMgr: inventory });
            await solver.initialize();

            const intent1 = buildValidBridgeIntent({ intentId: "intent-concurrent-1" });
            const intent2 = buildValidBridgeIntent({ intentId: "intent-concurrent-2" });

            // Solve both in parallel
            const [result1, result2] = await Promise.all([
                solver.solve(intent1),
                solver.solve(intent2),
            ]);

            // Both should succeed (inventory mocked to always canFulfill)
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);

            // Two distinct locks and deductions
            expect(inventory._locks).toHaveLength(2);
            expect(inventory._deductions).toHaveLength(2);
        });
    });

    describe("Settlement Failure (Non-Fatal)", () => {
        test("solve() succeeds even when settlement contract throws", async () => {
            const failedSettlement = mockSettlementManager({ shouldFail: true });
            const inventory = mockInventoryManager();

            const solver = buildTestSolver({
                inventoryMgr: inventory,
                settlementMgr: failedSettlement,
            });
            await solver.initialize();

            const intent = buildValidBridgeIntent();
            const result = await solver.solve(intent);

            // Solve succeeds (funds were sent, settlement will be retried separately)
            expect(result.success).toBe(true);
            expect(result.txHash).toMatch(/^0x/);

            // Inventory was deducted (send happened before settlement)
            expect(inventory._deductions).toHaveLength(1);
        });
    });
});
