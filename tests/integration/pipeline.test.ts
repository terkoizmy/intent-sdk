/**
 * T9 — Parser → Solver Pipeline Integration Test
 *
 * Verifies that a text intent parsed by IntentParser can be consumed
 * by IntentSolver.canSolve() and solve() without any intermediate
 * data transformation failures.
 *
 * Uses simulate mode + skips initialize() to avoid real RPC calls.
 *
 * Run: bun test tests/integration/pipeline.test.ts
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { IntentParser } from "../../src/parser";
import { IntentSolver } from "../../src/solver";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { Address, Hash } from "../../src/types/common";

// ─────────────────────────────────────────────
// Shared Fixtures
// ─────────────────────────────────────────────

/** Build IntentSolver in simulate mode without connecting to RPC */
function buildSolver(): IntentSolver {
    return new IntentSolver({
        agent: {
            privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // hardhat #0
            mode: "simulate",
            supportedChains: [1, 137],
            supportedTokens: ["USDC", "USDT", "ETH"],
        },
        contractAddress: "0x" + "cc".repeat(20),
    });
}

/** Build a SolverIntent from a parsed intent */
function makeIntent(
    parsedIntent: ReturnType<IntentParser["parse"]>["data"],
    deadline = Math.floor(Date.now() / 1000) + 3600,
): SolverIntent {
    return {
        intentId: "0x" + "a1".repeat(32) as Hash,
        intentHash: "0x" + "b1".repeat(32) as Hash,
        user: "0x" + "c1".repeat(20) as Address,
        signature: "0x",
        deadline,
        status: "pending",
        receivedAt: Date.now(),
        solver: "0x" + "d1".repeat(20) as Address,
        parsedIntent: parsedIntent as any,
    };
}

// ─────────────────────────────────────────────
// T9 — Pipeline: Parse → canSolve → solve
// ─────────────────────────────────────────────

describe("T9: Parser → Solver pipeline", () => {
    let parser: IntentParser;
    let solver: IntentSolver;

    beforeEach(() => {
        parser = new IntentParser();
        solver = buildSolver();
        // Bypass initialize() (which calls RPC) — set agent internals directly
        (solver.agent as any).status = "idle";
        (solver.agent as any).agentAddress = "0x" + "ab".repeat(20);
        // Pre-populate inventory so canFulfill() passes for bridge intents
        const inv = solver.inventoryManager;
        inv["balances"].set(`1:USDC`, 10_000_000_000n); // 10k USDC on ETH
        inv["balances"].set(`137:USDC`, 10_000_000_000n); // 10k USDC on Polygon
        inv["balances"].set(`1:USDT`, 10_000_000_000n);
        inv["balances"].set(`137:USDT`, 10_000_000_000n);
    });

    test("parsed bridge intent can be checked with canSolve (simulate mode)", () => {
        const result = parser.parse("Bridge 500 USDC from Ethereum to Polygon");
        expect(result.success).toBe(true);
        expect(result.data!.intentType).toBe("bridge");

        const intent = makeIntent(result.data);
        const canSolve = solver.agent.canSolve(intent);
        expect(canSolve).toBe(true);
    });

    test("parsed bridge intent is solvable in simulate mode (returns txHash)", async () => {
        const result = parser.parse("Bridge 200 USDT from Ethereum to Polygon");
        expect(result.success).toBe(true);

        const intent = makeIntent(result.data);
        const solution = await solver.agent.solve(intent);
        expect(solution.success).toBe(true);
        expect(solution.txHash).toBeDefined();
    });

    test("parsed unsupported intent type is rejected by canSolve", () => {
        const result = parser.parse("Swap 100 USDC for ETH on Polygon");
        expect(result.success).toBe(true);
        expect(result.data!.intentType).toBe("swap");

        const intent = makeIntent(result.data);
        // Solver only supports bridge intents currently
        const canSolve = solver.agent.canSolve(intent);
        expect(canSolve).toBe(false);
    });

    // T7 — Deadline expired before solve is called
    test("T7: expired intent deadline is rejected by canSolve", () => {
        const result = parser.parse("Bridge 100 USDC from Ethereum to Polygon");
        expect(result.success).toBe(true);

        // deadline 1 second in the PAST
        const intent = makeIntent(result.data, Math.floor(Date.now() / 1000) - 1);
        const canSolve = solver.agent.canSolve(intent);
        expect(canSolve).toBe(false);
    });

    // T7b — solve() rejects if deadline is expired
    test("T7b: solve() rejects expired intent", async () => {
        const result = parser.parse("Bridge 100 USDC from Ethereum to Polygon");
        const intent = makeIntent(result.data, Math.floor(Date.now() / 1000) - 1);
        await expect(solver.agent.solve(intent)).rejects.toThrow();
    });
});
