# Code Review — Phase H: Monitoring & Profit Tracking

5 issues found: 2 bugs, 2 design concerns, 1 test gap.

---

## `profit-tracker.ts`

### 🔴 BUG — `getROI()` double-iterates records and uses float precision

```diff
- const capital = BigInt(capitalDeployed);
- if (capital === 0n) return 0;

- const stats = this.getStats();
- const profit = Number(stats.totalProfit);        // ← BigInt→float truncation for large values
- const capitalNum = Number(capitalDeployed);

- let minTimestamp = Date.now();
- for (const record of this.records.values()) {   // ← second full pass over records
-     if (record.timestamp < minTimestamp) {
-         minTimestamp = record.timestamp;
-     }
- }
```

**Problems:**
1. `Number(stats.totalProfit)` loses precision for amounts > 2^53 (JavaScript float). For USDC with 6 decimals that's ~9 million USDC, which is realistic.
2. `getROI()` iterates records **twice** — once inside `getStats()`, then again to find `minTimestamp`. Since `getStats()` already loops records, `minTimestamp` can be tracked internally as a class field set during `recordAttempt()`.

**Fix:** Track `startedAt` when first attempt is recorded.

---

### 🟡 DESIGN — `recordAttempt()` silently overwrites on duplicate `intentId`

```typescript
// No guard: calling recordAttempt twice with the same intentId
// overwrites the original pricing silently
recordAttempt(intentId: string, pricing: PricingResult): void {
    this.records.set(intentId, { intentId, pricing, timestamp: Date.now() });
}
```

**Problem:** If `LiquidityAgent` calls `recordAttempt` on a retry, the original pricing and timestamp are lost. This is subtle and hard to debug.

**Fix:** Log a warning if the intentId is already tracked and `success` is still `undefined`.

---

## `health-checker.ts`

### 🔴 BUG — `catch (e: any)` — inventory error silently leaves `inventoryHealthy = false` with misleading message

```typescript
} catch (e: any) {
    inventoryDetails = e.message || "Inventory check failed";
    // inventoryHealthy is already false — but we also don't log the error
}
```

**Problem:** If `inventoryManager.getSnapshot()` throws (e.g. not initialized yet), the health check returns `inventory.healthy = false` but there's **no log** — the operator won't know whether it's a real error or just zero balance.

**Fix:** Add a `console.error` in the catch block to surface real errors.

---

### 🟡 DESIGN — `isHealthy()` runs a full `check()` and may be called frequently

```typescript
async isHealthy(): Promise<boolean> {
    const result = await this.check();
    return result.healthy;
}
```

**Problem:** If an operator polls `isHealthy()` every second (e.g. to gate intent processing), this runs a full `rpcProviderManager.checkHealth()` every call, which hits the network.

**Fix:** Cache the last `HealthCheckResult` for a configurable TTL (e.g. 10 seconds) and return cached value if within TTL.

---

## `monitoring.test.ts`

### 🟡 TEST GAP — No test for `recordResult()` on unknown `intentId`

The implementation logs a warning and returns early, but there's no test that verifies this graceful handling:

```typescript
// This path is untested:
if (!record) {
    console.warn(`[ProfitTracker] Cannot record result for unknown intent: ${intentId}`);
    return;
}
```

**Fix:** Add a test that calls `recordResult("nonexistent", true)` and asserts `getStats()` remains empty.

---

## Summary Table

| # | File | Severity | Issue |
|---|------|----------|-------|
| 1 | `profit-tracker.ts` | 🔴 Bug | `getROI()` float precision loss + double iteration |
| 2 | `profit-tracker.ts` | 🟡 Design | Silent overwrite on duplicate `recordAttempt()` |
| 3 | `health-checker.ts` | 🔴 Bug | Error swallowed silently in inventory catch block |
| 4 | `health-checker.ts` | 🟡 Design | `isHealthy()` runs full network check on every call |
| 5 | `monitoring.test.ts` | 🟡 Test Gap | Missing test for `recordResult()` on unknown intent |
