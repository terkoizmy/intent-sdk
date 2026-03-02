/**
 * Tests — Phase G: Mempool Integration
 *
 * Unit tests for:
 *   - MempoolClient (connect, disconnect, events, submitSolution)
 *   - IntentFilter (shouldSolve, dedup, type check, canSolve)
 *   - MempoolMonitor (start/stop, full pipeline, stats)
 *   - SolutionSubmitter (submit, already-solved race condition)
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MempoolClient, type IWebSocket } from "../../src/solver/mempool/mempool-client";
import { IntentFilter } from "../../src/solver/mempool/intent-filter";
import { MempoolMonitor } from "../../src/solver/mempool/mempool-monitor";
import { SolutionSubmitter } from "../../src/solver/mempool/solution-submitter";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { SolutionResult } from "../../src/solver/types/agent";
import type { Address, ChainId, Hash } from "../../src/types/common";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const USDC = 1_000_000n;
const USER_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const SOLVER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;

// ─────────────────────────────────────────────
// Mock WebSocket
// ─────────────────────────────────────────────

class MockWebSocket implements IWebSocket {
    sent: string[] = [];
    closed = false;
    onopen?: (() => void) | null;
    onclose?: ((event: { code: number; reason: string }) => void) | null;
    onmessage?: ((event: { data: string }) => void) | null;
    onerror?: ((event: { message?: string }) => void) | null;

    send(data: string): void { this.sent.push(data); }
    close(): void { this.closed = true; }

    // Helpers to simulate server sending messages
    simulateOpen(): void { this.onopen?.(); }
    simulateClose(code = 1000, reason = ""): void { this.onclose?.({ code, reason }); }
    simulateMessage(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) });
    }
    simulateError(message: string): void { this.onerror?.({ message }); }
}

// ─────────────────────────────────────────────
// Mock LiquidityAgent
// ─────────────────────────────────────────────

function buildMockAgent(opts: {
    canSolve?: boolean;
    solveResult?: SolutionResult;
} = {}) {
    const { canSolve = true, solveResult } = opts;
    const defaultResult: SolutionResult = {
        success: true,
        txHash: "0x" + "aa".repeat(32),
        profit: "7500000",
        output: "991500000",
        metadata: {
            solveDurationMs: 200,
            sourceChainId: 1 as ChainId,
            targetChainId: 137 as ChainId,
        },
    };

    return {
        canSolve: (_intent: SolverIntent) => canSolve,
        solve: async (_intent: SolverIntent) => solveResult ?? defaultResult,
        getStatus: () => "idle",
        getAgentAddress: () => SOLVER_ADDRESS,
    } as any;
}

// ─────────────────────────────────────────────
// Intent Factory
// ─────────────────────────────────────────────

function buildMockIntent(overrides: Partial<SolverIntent> = {}): SolverIntent {
    return {
        intentId: "0x" + "aa".repeat(32),
        intentHash: "0x" + "bb".repeat(32) as Hash,
        user: USER_ADDRESS,
        signature: "0xfakesig",
        deadline: Math.floor(Date.now() / 1000) + 3600,
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
            constraints: { maxSlippage: 100 },
            confidence: 0.95,
            rawInput: "Bridge 1000 USDC from Ethereum to Polygon",
        },
        ...overrides,
    } as SolverIntent;
}

// ─────────────────────────────────────────────
// MempoolClient Tests
// ─────────────────────────────────────────────

describe("MempoolClient", () => {
    let mockWs: MockWebSocket;
    let client: MempoolClient;

    beforeEach(() => {
        mockWs = new MockWebSocket();
        client = new MempoolClient((_url: string) => mockWs);
    });

    test("connect() should open WebSocket and emit 'connected'", () => {
        let connected = false;
        client.on("connected", () => { connected = true; });

        client.connect("ws://mempool.test");
        mockWs.simulateOpen();

        expect(connected).toBe(true);
        expect(client.isConnected()).toBe(true);
    });

    test("disconnect() should close socket and mark as disconnected", () => {
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();

        client.disconnect();

        expect(mockWs.closed).toBe(true);
        expect(client.isConnected()).toBe(false);
    });

    test("should emit 'disconnected' when socket closes", () => {
        let payload: { code: number; reason: string } | undefined;
        client.on("disconnected", (p) => { payload = p; });

        client.connect("ws://mempool.test");
        mockWs.simulateClose(1001, "going away");

        expect(payload?.code).toBe(1001);
        expect(payload?.reason).toBe("going away");
    });

    test("should emit 'new_intent' on incoming intent message", () => {
        const intent = buildMockIntent();
        let received: SolverIntent | undefined;
        client.on("new_intent", (i) => { received = i; });

        client.connect("ws://mempool.test");
        mockWs.simulateMessage({ type: "new_intent", payload: intent });

        expect(received?.intentId).toBe(intent.intentId);
    });

    test("should emit 'error' on WebSocket error", () => {
        let error: Error | undefined;
        client.on("error", (e) => { error = e; });

        client.connect("ws://mempool.test");
        mockWs.simulateError("connection refused");

        expect(error?.message).toContain("connection refused");
    });

    test("off() should unregister listener", () => {
        let callCount = 0;
        const cb = () => { callCount++; };

        client.on("connected", cb);
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();
        client.off("connected", cb);

        // Connect again — cb should NOT fire
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();

        expect(callCount).toBe(1); // Only fired once before unregistering
    });

    test("submitSolution() should send formatted message when connected", () => {
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();

        client.submitSolution("0xintent", "0xtxhash", SOLVER_ADDRESS, "7500000");

        expect(mockWs.sent.length).toBe(1);
        const msg = JSON.parse(mockWs.sent[0]);
        expect(msg.type).toBe("submit_solution");
        expect(msg.payload.intentId).toBe("0xintent");
        expect(msg.payload.txHash).toBe("0xtxhash");
    });
});

// ─────────────────────────────────────────────
// IntentFilter Tests
// ─────────────────────────────────────────────

describe("IntentFilter", () => {
    test("shouldSolve() returns true for valid bridge intent", () => {
        const filter = new IntentFilter(buildMockAgent({ canSolve: true }));
        expect(filter.shouldSolve(buildMockIntent())).toBe(true);
    });

    test("shouldSolve() returns false for non-bridge intent", () => {
        const filter = new IntentFilter(buildMockAgent({ canSolve: true }));
        const intent = buildMockIntent({
            parsedIntent: {
                intentType: "send",
                parameters: {},
                constraints: {},
                confidence: 0.9,
                rawInput: "Send",
            }
        } as any);
        expect(filter.shouldSolve(intent)).toBe(false);
    });

    test("shouldSolve() returns false for duplicate intentId", () => {
        const filter = new IntentFilter(buildMockAgent({ canSolve: true }));
        const intent = buildMockIntent();

        // First call — should pass
        expect(filter.shouldSolve(intent)).toBe(true);
        // Second call with same intentId — should be deduped
        expect(filter.shouldSolve(intent)).toBe(false);
    });

    test("shouldSolve() returns false when canSolve() returns false", () => {
        const filter = new IntentFilter(buildMockAgent({ canSolve: false }));
        expect(filter.shouldSolve(buildMockIntent())).toBe(false);
    });

    test("getSeenCount() tracks unique intentIds", () => {
        const filter = new IntentFilter(buildMockAgent());
        const a = buildMockIntent({ intentId: "0x" + "aa".repeat(32) });
        const b = buildMockIntent({ intentId: "0x" + "bb".repeat(32) });

        filter.shouldSolve(a);
        filter.shouldSolve(b);

        expect(filter.getSeenCount()).toBe(2);
    });

    test("markSolved() prevents future shouldSolve() from passing", () => {
        const filter = new IntentFilter(buildMockAgent());
        const intent = buildMockIntent({ intentId: "0xAA" });

        filter.markSolved("0xAA");
        expect(filter.shouldSolve(intent)).toBe(false);
    });
});

// ─────────────────────────────────────────────
// MempoolMonitor Tests
// ─────────────────────────────────────────────

describe("MempoolMonitor", () => {
    function buildMonitor(opts: { agentCanSolve?: boolean; agentResult?: SolutionResult } = {}) {
        const mockWs = new MockWebSocket();
        const client = new MempoolClient((_url: string) => mockWs);
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();

        const agent = buildMockAgent({
            canSolve: opts.agentCanSolve ?? true,
            solveResult: opts.agentResult,
        });
        const filter = new IntentFilter(agent);
        const submitter = new SolutionSubmitter(client);
        const monitor = new MempoolMonitor(client, filter, agent, submitter);

        return { monitor, client, mockWs, filter, agent, submitter };
    }

    test("start() / stop() toggle isRunning()", () => {
        const { monitor } = buildMonitor();
        expect(monitor.isRunning()).toBe(false);

        monitor.start();
        expect(monitor.isRunning()).toBe(true);

        monitor.stop();
        expect(monitor.isRunning()).toBe(false);
    });

    test("should increment 'received' counter for each new_intent", async () => {
        const { monitor, mockWs } = buildMonitor();
        monitor.start();

        const intent = buildMockIntent();
        mockWs.simulateMessage({ type: "new_intent", payload: intent });

        // Allow promise microtasks to flush
        await new Promise((r) => setTimeout(r, 10));

        expect(monitor.getStats().received).toBe(1);
    });

    test("full flow: new_intent → filter → solve → submit updates stats", async () => {
        const { monitor, mockWs } = buildMonitor();
        monitor.start();

        mockWs.simulateMessage({ type: "new_intent", payload: buildMockIntent() });

        await new Promise((r) => setTimeout(r, 20));

        const stats = monitor.getStats();
        expect(stats.received).toBe(1);
        expect(stats.filtered).toBe(1);
        expect(stats.solved).toBe(1);
        expect(stats.failed).toBe(0);
    });

    test("filtered intents (canSolve=false) do not increment 'filtered'", async () => {
        const { monitor, mockWs } = buildMonitor({ agentCanSolve: false });
        monitor.start();

        mockWs.simulateMessage({ type: "new_intent", payload: buildMockIntent() });

        await new Promise((r) => setTimeout(r, 20));

        const stats = monitor.getStats();
        expect(stats.received).toBe(1);
        expect(stats.filtered).toBe(0);
        expect(stats.solved).toBe(0);
    });

    test("failed solves increment 'failed' counter", async () => {
        const failResult: SolutionResult = {
            success: false,
            error: "Insufficient inventory",
        };
        const { monitor, mockWs } = buildMonitor({ agentResult: failResult });
        monitor.start();

        mockWs.simulateMessage({ type: "new_intent", payload: buildMockIntent() });
        await new Promise((r) => setTimeout(r, 20));

        const stats = monitor.getStats();
        expect(stats.failed).toBe(1);
        expect(stats.solved).toBe(0);
    });
});

// ─────────────────────────────────────────────
// SolutionSubmitter Tests
// ─────────────────────────────────────────────

describe("SolutionSubmitter", () => {
    function buildSubmitter() {
        const mockWs = new MockWebSocket();
        const client = new MempoolClient((_url: string) => mockWs);
        client.connect("ws://mempool.test");
        mockWs.simulateOpen();
        const submitter = new SolutionSubmitter(client);
        return { submitter, mockWs };
    }

    test("submit() sends message when solution is successful", () => {
        const { submitter, mockWs } = buildSubmitter();
        const result: SolutionResult = {
            success: true,
            txHash: "0x" + "cc".repeat(32),
            profit: "7500000",
            metadata: {
                solveDurationMs: 150,
                sourceChainId: 1 as ChainId,
                targetChainId: 137 as ChainId,
            },
        };

        const outcome = submitter.submit("0xintent123", result);
        expect(outcome.submitted).toBe(true);
        expect(outcome.alreadySolved).toBe(false);
        expect(mockWs.sent.length).toBe(1);
    });

    test("submit() skips failed solutions", () => {
        const { submitter, mockWs } = buildSubmitter();
        const result: SolutionResult = { success: false, error: "Not enough inventory" };

        const outcome = submitter.submit("0xintent123", result);
        expect(outcome.submitted).toBe(false);
        expect(mockWs.sent.length).toBe(0);
    });
});
