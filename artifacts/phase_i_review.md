# Code Review — Phase I: Protocols for Rebalancing

5 issues found: 2 bugs, 2 design concerns, 1 test gap.

---

## `aggregators/swing.ts`

### 🔴 BUG — `quote()` doesn't validate deep property access

```typescript
const route = data.routes[0];
return {
    outputAmount: BigInt(route.quote.integration.amountOut), // ← crashes if shape differs
```

**Problem:** If `route.quote` or `route.quote.integration` is `undefined` (API schema change, rate limit response), this throws `TypeError: Cannot read properties of undefined` — an unhelpful crash message for the operator.

**Fix:** Add defensive check before accessing nested properties.

---

### 🟡 DESIGN — `quote()` silently drops non-first routes

```typescript
if (!data.routes || data.routes.length === 0) {
    throw new Error("No bridge routes found by Swing");
}
const route = data.routes[0]; // ← always picks first, no logging of alternatives
```

**Problem:** Swing often returns multiple routes sorted by different criteria (cheapest, fastest, etc.). We silently discard all but the first. In production, the operator has no visibility into how many alternatives existed or how much they differed.

**Fix:** Log the count of available routes for observability.

---

## `lending/aave.ts`

### 🔴 BUG — `getAPY()` returns hardcoded value, no chain/token validation

```typescript
async getAPY(token: string, chainId: number): Promise<number> {
    return 4.5; // Example: 4.5% APY
}
```

**Problem:** This is a mock that silently returns `4.5` for **any** chain, even unsupported ones. If the `Rebalancer` calls `getAPY(token, 999)`, it gets `4.5` instead of an error. This can lead to incorrect yield calculations.

**Fix:** Add `supports()` guard and a clear `// TODO` marker. Also guard the function against unsupported chains.

---

### 🟡 DESIGN — `rpcProviderManager` injected but never used

```typescript
constructor(
    private readonly rpcProviderManager: RPCProviderManager, // ← never referenced
    private readonly poolAddress: Record<number, Address>,
) { super(); }
```

**Problem:** The dependency is declared but unused. This technically works but is misleading — it looks like Aave reads on-chain data, but currently it doesn't. While it's intentionally a placeholder for future on-chain `getReserveData` calls, unlabeled unused dependencies can confuse code reviewers.

**Fix:** Add a clear `@todo` annotation on the constructor parameter.

---

## `protocols.test.ts`

### 🟡 TEST GAP — No test for `SwingProtocol.quote()` when API returns empty routes

The implementation throws `"No bridge routes found by Swing"`, but there's no test that verifies this error-path:

```typescript
// This path is untested:
if (!data.routes || data.routes.length === 0) {
    throw new Error("No bridge routes found by Swing");
}
```

**Fix:** Add a test that mocks an empty `routes: []` response and asserts the appropriate error.

---

## Summary Table

| # | File | Severity | Issue |
|---|------|----------|-------|
| 1 | `swing.ts` | 🔴 Bug | Deep property access crash on unexpected API shape |
| 2 | `swing.ts` | 🟡 Design | Silently drops alternative routes, no observability |
| 3 | `aave.ts` | 🔴 Bug | `getAPY()` hardcoded value returns for unsupported chains |
| 4 | `aave.ts` | 🟡 Design | `rpcProviderManager` declared but never used |
| 5 | `protocols.test.ts` | 🟡 Test Gap | Missing error-path test for empty Swing routes |
