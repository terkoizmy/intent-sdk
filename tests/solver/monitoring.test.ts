/**
 * Tests — Phase H: Monitoring & Profit Tracking
 *
 * Unit tests for:
 *   - ProfitTracker (metrics, ROI, success/failure tally)
 *   - HealthChecker (RPC, inventory, mempool aggregate status)
 *   - AlertManager (structured logging, level filtering, helpers)
 */

import { describe, test, expect } from "bun:test";
import { ProfitTracker } from "../../src/solver/monitoring/profit-tracker";
import { HealthChecker } from "../../src/solver/monitoring/health-checker";
import { AlertManager } from "../../src/solver/monitoring/alert-manager";
import type { PricingResult } from "../../src/solver/types/pricing";
import type { ChainId } from "../../src/types/common";

// ─────────────────────────────────────────────
// ProfitTracker
// ─────────────────────────────────────────────

describe("ProfitTracker", () => {
    const buildPricing = (overrides: Partial<PricingResult> = {}): PricingResult => ({
        baseFee: "100",
        gasCost: "50",
        slippageCapture: "20",
        totalFee: "170",
        userPays: "1170",
        userReceives: "1000",
        solverProfit: "120",
        ...overrides,
    });

    test("recordAttempt() stores pricing and getStats() shows 0 profit initially", () => {
        const tracker = new ProfitTracker();
        tracker.recordAttempt("0x111", buildPricing());

        const stats = tracker.getStats();
        expect(stats.successCount).toBe(0);
        expect(stats.failCount).toBe(0);
        expect(stats.totalProfit).toBe("0");
        expect(stats.totalAttempts).toBe(0);
    });

    test("recordResult(success=true) calculates netProfit correctly", () => {
        const tracker = new ProfitTracker();
        tracker.recordAttempt("0x111", buildPricing({ totalFee: "200" }));

        // Suppose actual gas cost was exactly 40
        tracker.recordResult("0x111", true, "40");

        const stats = tracker.getStats();
        expect(stats.successCount).toBe(1);
        expect(stats.failCount).toBe(0);
        expect(stats.totalAttempts).toBe(1);

        // netProfit = totalFee (200) - actualGas (40) = 160
        expect(stats.totalProfit).toBe("160");
        expect(stats.avgProfit).toBe("160");
        expect(stats.totalGasCost).toBe("40");
    });

    test("recordResult(success=false) increments failCount and resets profit to 0", () => {
        const tracker = new ProfitTracker();
        tracker.recordAttempt("0x111", buildPricing());

        tracker.recordResult("0x111", false, "10"); // actual gas wasted 10

        const stats = tracker.getStats();
        expect(stats.successCount).toBe(0);
        expect(stats.failCount).toBe(1);
        expect(stats.totalAttempts).toBe(1);

        expect(stats.totalProfit).toBe("0");
        expect(stats.avgProfit).toBe("0");
    });

    test("getStats() aggregates multiple records correctly", () => {
        const tracker = new ProfitTracker();

        tracker.recordAttempt("0x1", buildPricing({ totalFee: "100" }));
        tracker.recordResult("0x1", true, "20"); // Profit = 80

        tracker.recordAttempt("0x2", buildPricing({ totalFee: "150" }));
        tracker.recordResult("0x2", true, "50"); // Profit = 100

        tracker.recordAttempt("0x3", buildPricing());
        tracker.recordResult("0x3", false); // Failed

        const stats = tracker.getStats();
        expect(stats.successCount).toBe(2);
        expect(stats.failCount).toBe(1);
        expect(stats.totalAttempts).toBe(3);
        expect(stats.totalProfit).toBe("180"); // 80 + 100
        expect(stats.totalGasCost).toBe("70");  // 20 + 50
        expect(stats.avgProfit).toBe("90");     // 180 / 2
    });

    test("getROI() produces annualized percentage > 0 when profitable", async () => {
        const tracker = new ProfitTracker();
        tracker.recordAttempt("0x1", buildPricing({ totalFee: "100" }));
        tracker.recordResult("0x1", true, "0"); // Profit = 100

        // Allow some time (elapsedMs) to pass so yearsElapsed > 0
        await new Promise((r) => setTimeout(r, 15));

        // Let's assume deployed capital is 1000
        const roi = tracker.getROI("1000");
        expect(roi).toBeGreaterThan(0);
    });

    test("getROI() handles 0 capital safely", () => {
        const tracker = new ProfitTracker();
        tracker.recordAttempt("0x1", buildPricing({ totalFee: "100" }));
        tracker.recordResult("0x1", true, "0");

        expect(tracker.getROI("0")).toBe(0); // Should not throw div by zero
    });

    test("recordResult() on unknown intentId is a safe no-op", () => {
        const tracker = new ProfitTracker();
        // No recordAttempt called before this
        tracker.recordResult("0xnonexistent", true, "100");

        const stats = tracker.getStats();
        // Nothing should be tracked — record was silently ignored
        expect(stats.successCount).toBe(0);
        expect(stats.failCount).toBe(0);
        expect(stats.totalProfit).toBe("0");
    });
});

// ─────────────────────────────────────────────
// HealthChecker
// ─────────────────────────────────────────────

describe("HealthChecker", () => {
    const buildMocks = (overrides: any = {}) => {
        const mockInventoryManager = {
            getSnapshot: () => ({
                balances: [{ available: "1000", locked: "0", chainId: 1, token: "USDC", lastUpdated: Date.now() }],
                totalUSDValue: "1000",
                timestamp: Date.now(),
            }),
            ...overrides.inventoryManager,
        };

        const mockMempoolClient = {
            isConnected: () => true,
            ...overrides.mempoolClient,
        };

        const mockRpcProviderManager = {
            checkHealth: async () => new Map<number, boolean>([
                [1, true],
                [137, true],
            ]),
            ...overrides.rpcProviderManager,
        };

        return new HealthChecker({
            inventoryManager: mockInventoryManager as any,
            mempoolClient: mockMempoolClient as any,
            rpcProviderManager: mockRpcProviderManager as any,
        });
    };

    test("check() returns healthy=true when all subsystems are UP", async () => {
        const checker = buildMocks();
        const result = await checker.check();

        expect(result.healthy).toBe(true);
        expect(result.checks.inventory.healthy).toBe(true);
        expect(result.checks.mempool.healthy).toBe(true);
        expect(result.checks.rpc.healthy).toBe(true);
        expect(await checker.isHealthy()).toBe(true);
    });

    test("check() returns healthy=false when mempool disconnected", async () => {
        const checker = buildMocks({
            mempoolClient: { isConnected: () => false },
        });

        const result = await checker.check();
        expect(result.healthy).toBe(false);
        expect(result.checks.mempool.healthy).toBe(false);
        expect(result.checks.mempool.details).toContain("Disconnected");
    });

    test("check() returns healthy=false when RPC nodes are down", async () => {
        const checker = buildMocks({
            rpcProviderManager: {
                checkHealth: async () => new Map<number, boolean>([[1, false], [137, true]]), // ETH down
            },
        });

        const result = await checker.check();
        expect(result.healthy).toBe(false);
        expect(result.checks.rpc.healthy).toBe(false);
        expect(result.checks.rpc.details).toContain("1 provider(s) down");
    });

    test("check() returns healthy=false when inventory is empty globally", async () => {
        const checker = buildMocks({
            inventoryManager: {
                getSnapshot: () => ({ balances: [{ available: "0" }], totalUSDValue: "0" }),
            },
        });

        const result = await checker.check();
        expect(result.healthy).toBe(false);
        expect(result.checks.inventory.healthy).toBe(false);
    });
});

// ─────────────────────────────────────────────
// AlertManager
// ─────────────────────────────────────────────

describe("AlertManager", () => {
    test("alert() stores generic alert successfully", () => {
        const manager = new AlertManager();
        manager.alert("info", "Test info message");

        const alerts = manager.getAlerts();
        expect(alerts.length).toBe(1);
        expect(alerts[0].level).toBe("info");
        expect(alerts[0].message).toBe("Test info message");
        expect(alerts[0].id).toBeDefined();
    });

    test("getAlerts() filters by level correctly", () => {
        const manager = new AlertManager();
        manager.alert("info", "Information");
        manager.alert("warning", "Something slow");
        manager.alert("critical", "System crash");
        manager.alert("critical", "DB offline");

        expect(manager.getAlerts().length).toBe(4);
        expect(manager.getAlerts("info").length).toBe(1);
        expect(manager.getAlerts("warning").length).toBe(1);
        expect(manager.getAlerts("critical").length).toBe(2);
    });

    test("alertLowInventory() helper creates properly structured warning", () => {
        const manager = new AlertManager();
        manager.alertLowInventory(137 as ChainId, "USDC", "50", "100");

        const [alert] = manager.getAlerts("warning");
        expect(alert).toBeDefined();
        expect(alert.message).toContain("Low inventory");
        expect(alert.message).toContain("137"); // chainId
        expect(alert.context?.available).toBe("50");
    });

    test("alertFailedClaim() helper creates properly structured critical alert", () => {
        const manager = new AlertManager();
        manager.alertFailedClaim("0x123abc", "Nonce too low", 2);

        const [alert] = manager.getAlerts("critical");
        expect(alert).toBeDefined();
        expect(alert.message).toContain("Failed claim");
        expect(alert.message).toContain("0x123abc");
        expect(alert.context?.attempt).toBe(2);
    });

    test("clearAlerts() removes all elements", () => {
        const manager = new AlertManager();
        manager.alert("info", "Test");
        expect(manager.getAlerts().length).toBe(1);

        manager.clearAlerts();
        expect(manager.getAlerts().length).toBe(0);
    });
});
