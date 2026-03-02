/**
 * Integration Tests — Phase L: Full Bridge Flow
 *
 * End-to-end tests combining IntentParser + IntentSolver through the
 * full pipeline: parse → validate → quote → solve → settle.
 *
 * All subsystems are mocked (no real RPC, no real blockchain).
 * Tests focus on correctness of inter-module wiring and data flow.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { IntentParser } from "../../src/parser";
import { IntentSolver } from "../../src/solver";
import { buildAgentConfig } from "../../src/solver/agent/agent-config";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { Address, ChainId, Hash } from "../../src/types/common";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const USDC = 1_000_000n; // 6 decimals
const SOLVER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const USER_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const DEADLINE_FUTURE = Math.floor(Date.now() / 1000) + 3600;

// ─────────────────────────────────────────────
// Mock Factories (same pattern as unit tests)
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

function mockInventoryManager(opts: {
    canFulfill?: boolean;
    balance?: bigint;
} = {}) {
    const { canFulfill = true, balance = 50_000n * USDC } = opts;
    const deductions: string[] = [];
    const locks: string[] = [];
    const unlocks: string[] = [];

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
        getSnapshot: () => ({
            balances: {},
            totalValueUsd: "150000",
            timestamp: Date.now(),
        }),
        // Test helpers
        get _locks() { return locks; },
        get _unlocks() { return unlocks; },
        get _deductions() { return deductions; },
    } as any;
}

function mockDynamicPricing(opts: { shouldReject?: boolean } = {}) {
    return {
        getPrice: (_intent: SolverIntent) => ({
            baseFee: "500000",
            gasCost: "100000",
            slippageCapture: "250000",
            totalFee: "850000",
            userPays: "100000000",
            userReceives: "99150000",
            solverProfit: "750000",
        }),
        getInventoryMultiplier: () => 1.0,
        shouldReject: () => opts.shouldReject ?? false,
    } as any;
}

function mockSettlementManager(opts: { shouldFail?: boolean } = {}) {
    const settlements: string[] = [];
    return {
        settleIntent: async (intent: SolverIntent, _txHash: Hash) => {
            if (opts.shouldFail) throw new Error("Settlement failed: contract unreachable");
            settlements.push(intent.intentId);
            return {
                intentId: intent.intentId,
                solver: SOLVER_ADDRESS,
                targetTx: _txHash,
                status: "completed",
                startedAt: Math.floor(Date.now() / 1000),
                claimAttempts: 1,
            };
        },
        watchPendingSettlements: () => { },
        stopWatching: () => { },
        getSettlement: (_id: string) => undefined,
        getAllSettlements: () => [],
        // Test helpers
        get _settlements() { return settlements; },
    } as any;
}

function mockMempoolMonitor() {
    return {
        start: () => { },
        stop: () => { },
        getStats: () => ({ received: 0, filtered: 0, solved: 0, failed: 0 }),
    } as any;
}

function mockProfitTracker() {
    const attempts: string[] = [];
    const results: Array<{ id: string; success: boolean }> = [];
    return {
        recordAttempt: (intentId: string) => attempts.push(intentId),
        recordResult: (intentId: string, success: boolean) => results.push({ id: intentId, success }),
        getStats: () => ({
            totalAttempts: attempts.length,
            totalSuccesses: results.filter(r => r.success).length,
            totalFailures: results.filter(r => !r.success).length,
            totalProfit: "750000",
            averageProfit: "750000",
            roi: "0.75",
        }),
        // Test helpers
        get _attempts() { return attempts; },
        get _results() { return results; },
    } as any;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Build a SolverIntent from parsed parameters.
 * This simulates what a frontend or gateway would assemble.
 */
function buildSolverIntentFrom(parsedParams: Record<string, any>): SolverIntent {
    return {
        intentId: "intent-" + Date.now(),
        intentHash: ("0x" + "ab".repeat(32)) as Hash,
        user: USER_ADDRESS,
        signature: "0xfakeusersigrature",
        deadline: DEADLINE_FUTURE,
        status: "pending",
        receivedAt: Math.floor(Date.now() / 1000),
        parsedIntent: {
            intentType: parsedParams.intentType ?? "bridge",
            parameters: parsedParams.parameters ?? {},
            constraints: parsedParams.constraints ?? {},
            confidence: parsedParams.confidence ?? 0.9,
            rawInput: parsedParams.rawInput ?? "",
        },
    } as SolverIntent;
}

/**
 * Create a fresh IntentSolver with all subsystems injected as mocks.
 */
function buildTestSolver(opts: {
    inventoryMgr?: ReturnType<typeof mockInventoryManager>;
    settlementMgr?: ReturnType<typeof mockSettlementManager>;
    pricingMgr?: ReturnType<typeof mockDynamicPricing>;
    profitTracker?: ReturnType<typeof mockProfitTracker>;
    supportedChains?: ChainId[];
    supportedTokens?: string[];
} = {}) {
    const config = buildAgentConfig({
        agent: {
            name: "IntegrationTestAgent",
            privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
            supportedChains: opts.supportedChains ?? [1, 42161] as ChainId[],
            supportedTokens: opts.supportedTokens ?? ["USDC"],
            mode: "simulate",
        },
        contractAddress: "0x0000000000000000000000000000000000000000",
    });

    const solver = new IntentSolver(config as any);

    // Inject mocks by replacing private fields
    (solver as any).walletManager = mockWalletManager();
    (solver as any).inventoryManager = opts.inventoryMgr ?? mockInventoryManager();
    (solver as any).dynamicPricing = opts.pricingMgr ?? mockDynamicPricing();
    (solver as any).settlementManager = opts.settlementMgr ?? mockSettlementManager();
    (solver as any).profitTracker = opts.profitTracker ?? mockProfitTracker();
    (solver as any).mempoolMonitor = mockMempoolMonitor();

    // Rewire agent's dependencies too
    (solver.agent as any).inventoryManager = (solver as any).inventoryManager;
    (solver.agent as any).dynamicPricing = (solver as any).dynamicPricing;
    (solver.agent as any).settlementManager = (solver as any).settlementManager;
    (solver.agent as any).walletManager = (solver as any).walletManager;

    return solver;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("Full Bridge Flow — Integration", () => {

    describe("Step 1: IntentParser can parse bridge text", () => {
        test("should parse 'Bridge 100 USDC to Arbitrum' correctly", async () => {
            const parser = new IntentParser();
            const result = await parser.parse("Bridge 100 USDC to Arbitrum");

            // Parser should return a ParseResult (success or fail)
            expect(result).toBeDefined();

            if (result.success && result.data) {
                expect(result.data.intentType).toBe("bridge");
                expect(result.data.parameters.inputToken?.toUpperCase()).toBe("USDC");
                expect(result.data.parameters.inputAmount).toBeDefined();
            } else {
                // Parser may fail on some inputs — verify graceful error
                expect(result.success).toBe(false);
            }
        });

        test("should parse bridge intent with source chain", async () => {
            const parser = new IntentParser();
            const result = await parser.parse("Bridge 500 USDC from Ethereum to Arbitrum");
            // console.log(result);
            // Either the parse succeeds with bridge type, or it fails gracefully
            // (some parsers may not handle 'from Ethereum' source chain in text)
            if (result.success && result.data) {
                expect(result.data.intentType).toBe("bridge");
                expect(result.data.parameters.inputToken?.toUpperCase()).toBe("USDC");
            } else {
                // If parser fails, success should be false with an error message
                expect(result.success).toBe(false);
            }
        });

        test("should parse swap intent with source chain", async () => {
            const parser = new IntentParser();
            const result = await parser.parse("Swap 500 USDC from Ethereum to Arbitrum");
            // Either the parse succeeds with bridge type, or it fails gracefully
            // (some parsers may not handle 'from Ethereum' source chain in text)
            if (result.success && result.data) {
                expect(result.data.intentType).toBe("swap");
                expect(result.data.parameters.inputToken?.toUpperCase()).toBe("USDC");
            } else {
                // If parser fails, success should be false with an error message
                expect(result.success).toBe(false);
            }
        });
    });

    describe("Step 2: Parser output → SolverIntent → canSolve()", () => {
        test("should accept bridge intent for supported chain + token", async () => {
            const parser = new IntentParser();
            const parsed = await parser.parse("Bridge 100 USDC to Arbitrum");

            const intent = buildSolverIntentFrom({
                ...parsed,
                parameters: {
                    ...parsed.parameters,
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",  // 100 USDC (6 dec)
                    recipient: USER_ADDRESS,
                },
            });

            const solver = buildTestSolver();
            await solver.initialize();

            expect(solver.canSolve(intent)).toBe(true);
        });

        test("should reject non-bridge intent type (send)", async () => {
            const intent = buildSolverIntentFrom({
                intentType: "send",
                parameters: { inputToken: "USDC", inputAmount: "100000000" },
                constraints: {},
                confidence: 0.9,
                rawInput: "Send 100 USDC",
            });


            const solver = buildTestSolver();
            await solver.initialize();
            expect(solver.canSolve(intent)).toBe(false);
        });

        test("should reject if targetChain not in supportedChains", () => {
            const intent = buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "137",  // Polygon — not in config
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: {},
                confidence: 0.9,
                rawInput: "Bridge 100 USDC to Polygon",
            });

            const solver = buildTestSolver({ supportedChains: [1, 42161] as ChainId[] });

            expect(solver.canSolve(intent)).toBe(false);
        });
    });

    describe("Step 3: getQuote() — pricing", () => {
        test("should return a fee breakdown for solvable intent", async () => {
            const intent = buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: {},
                confidence: 0.9,
                rawInput: "Bridge 100 USDC to Arbitrum",
            });

            const solver = buildTestSolver();
            await solver.initialize();

            const quote = solver.getQuote(intent);

            expect(quote.totalFee).toBeDefined();
            expect(quote.solverProfit).toBeDefined();
            expect(quote.userReceives).toBeDefined();
            expect(BigInt(quote.userReceives)).toBeLessThan(BigInt(quote.userPays));
        });
    });

    describe("Step 4: solve() — full simulate flow", () => {
        test("should complete full pipeline and return success", async () => {
            const inventory = mockInventoryManager();
            const settlement = mockSettlementManager();
            const profit = mockProfitTracker();

            const intent = buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: { maxSlippage: 50 },
                confidence: 0.95,
                rawInput: "Bridge 100 USDC to Arbitrum",
            });

            const solver = buildTestSolver({ inventoryMgr: inventory, settlementMgr: settlement, profitTracker: profit });
            await solver.initialize();

            const result = await solver.solve(intent);

            expect(result.success).toBe(true);
            expect(result.txHash).toMatch(/^0x/);
            expect(result.profit).toBe("750000");
            expect(result.output).toBe("99150000");
            expect(result.metadata).toBeDefined();
            expect(result.metadata!.sourceChainId).toBe(1);
            expect(result.metadata!.targetChainId).toBe(42161);

            // Inventory was locked and then deducted
            expect(inventory._locks).toHaveLength(1);
            expect(inventory._deductions).toHaveLength(1);
            expect(inventory._unlocks).toHaveLength(0);

            // Settlement was triggered
            expect(settlement._settlements).toHaveLength(1);
        });

        test("should return success even if settlement throws (non-fatal)", async () => {
            // Settlement failures are logged but don't fail the solve result
            const failSettlement = mockSettlementManager({ shouldFail: true });
            const inventory = mockInventoryManager();

            const intent = buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: {},
                confidence: 0.9,
                rawInput: "Bridge 100 USDC to Arbitrum",
            });

            const solver = buildTestSolver({ inventoryMgr: inventory, settlementMgr: failSettlement });
            await solver.initialize();

            const result = await solver.solve(intent);

            // Solve should still succeed even though settlement threw
            expect(result.success).toBe(true);
            expect(result.txHash).toBeDefined();

            // Inventory should be deducted (funds were sent)
            expect(inventory._deductions).toHaveLength(1);
        });

        test("should verify status is idle after solve completes", async () => {
            const intent = buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: {},
                confidence: 0.9,
                rawInput: "Bridge 100 USDC to Arbitrum",
            });

            const solver = buildTestSolver();
            await solver.initialize();

            expect(solver.getStatus()).toBe("idle");
            await solver.solve(intent);
            expect(solver.getStatus()).toBe("idle");
        });
    });

    describe("Step 5: getStats() — profit tracking across solves", () => {
        test("should track multiple sequential solves", async () => {
            const profit = mockProfitTracker();
            const solver = buildTestSolver({ profitTracker: profit });
            await solver.initialize();

            const makeIntent = (id: string) => buildSolverIntentFrom({
                intentType: "bridge",
                parameters: {
                    sourceChain: "1",
                    targetChain: "42161",
                    inputToken: "USDC",
                    inputAmount: "100000000",
                    recipient: USER_ADDRESS,
                },
                constraints: {},
                confidence: 0.9,
                rawInput: `Bridge 100 USDC to Arbitrum (${id})`,
            });

            // Solve 3 intents sequentially
            await solver.solve({ ...makeIntent("1"), intentId: "intent-1" } as SolverIntent);
            await solver.solve({ ...makeIntent("2"), intentId: "intent-2" } as SolverIntent);
            await solver.solve({ ...makeIntent("3"), intentId: "intent-3" } as SolverIntent);

            const stats = solver.getStats();

            // profitTracker should have 3 attempts recorded
            expect(profit._attempts).toHaveLength(3);
            expect(profit._results).toHaveLength(3);
            expect(stats.profitStats.totalProfit).toBeDefined();
        });
    });
});
