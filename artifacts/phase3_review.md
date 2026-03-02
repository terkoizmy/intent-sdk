# Phase 3 Code Review — Advanced Features

> Reviewed: `token.ts`, `token-resolver.ts`, `parser-helpers.ts`, `index.ts`, `types/token.ts`, `types/index.ts`, `extractors.test.ts`, `token-resolver.test.ts`

---

## Summary

| Area | Score | Notes |
|------|-------|-------|
| Token Resolver | ⭐⭐⭐⭐ | Well-structured, good caching, proper error handling |
| NFT Detection | ⭐⭐⭐ | Works but has structural & performance issues |
| Confidence Scoring | ⭐⭐⭐ | Functional but scoring formula lacks calibration |
| Integration (`index.ts`) | ⭐⭐⭐⭐ | Clean sync/async split, good backward compat |
| Types | ⭐⭐⭐⭐⭐ | Excellent documentation and structure |
| Tests | ⭐⭐ | Insufficient coverage for Phase 3 features |

---

## 🔴 Critical Issues

### 1. NFT collection list hardcoded inside `extract()` — recreated every call

**File**: [token.ts:33-42](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/token.ts#L33-L42)

The `knownCollections` array is defined **inside** the `extract()` method. This means:
- A new array + objects are allocated on **every single call**
- RegExp objects are also compiled fresh each time
- Zero configurability — users can't add/remove collections

```diff
- extract(text: string): TokenEntity[] {
-   const knownCollections = [ ... ];  // ❌ Inside method

+ private knownCollections = [ ... ];  // ✅ Move to class property
+ // Or better: accept via constructor like knownTokens
```

### 2. `parseAsync` does NOT recalculate confidence after resolving addresses

**File**: [index.ts:236-240](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts#L236-L240)

The comment says "recalculate confidence" but the code only has a `// Note:` comment and **never actually does it**. The `calculateConfidence` function already has bonuses for `inputTokenAddress` / `outputTokenAddress`, but these are never triggered because addresses are resolved **after** confidence is calculated.

```typescript
// Current: confidence calculated BEFORE addresses are resolved
// Addresses resolved → confidence NOT updated → bonus never applied
```

### 3. `nft_purchase` in `mergeEntities` duplicates NFT detection logic

**File**: [parser-helpers.ts:150-166](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts#L150-L166)

The `nft_purchase` case hardcodes collection detection via `lowerText.includes("bored ape")` etc., but `TokenExtractor` already detects NFT collections and puts them in `entities.tokens` with `type: "collection"`. These two systems don't talk to each other — the `mergeEntities` function ignores `TokenExtractor`'s collection detection entirely.

```typescript
// parser-helpers.ts — ignores entities.tokens[].type === "collection"
if (lowerText.includes("bored ape")) {
   parameters.collection = "Bored Ape Yacht Club"; // ❌ Duplicated logic
}
```

### 4. `tokenPatterns` field is initialized but never used

**File**: [token.ts:9,16,151-153](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/token.ts#L9)

`this.tokenPatterns` is set in the constructor via `initializePatterns()` but the `extract()` method uses its own inline `/\b([A-Z]{2,10})\b/g` regex. Dead code.

---

## 🟡 Quality Issues

### 5. `isCommonWord` creates a new `Set` on every call

**File**: [token.ts:133-148](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/token.ts#L133-L148)

The `Set` should be a static class property or module-level constant — not reconstructed per invocation.

### 6. Stale TODO comments remain in production code

**File**: [token-resolver.ts:240-241](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/services/token-resolver.ts#L240-L241)

```typescript
// TODO: Implement cache key generation    ← stale, already implemented
//   return `${symbol.toUpperCase()}:${chain.toLowerCase()}`;
return `${symbol.toUpperCase()}:${chain.toLowerCase()}`;
```

### 7. Comment in `index.ts` says parse() becomes async with tokenResolver — misleading

**File**: [types/index.ts:35](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/index.ts#L35)

```typescript
* PERHATIAN: Mengaktifkan token resolver membuat parse() menjadi async!
```
This is technically **false** — `parse()` stays sync, only `parseAsync()` is async. The comment is misleading.

### 8. `resolveTokenAddresses` mutates intent in-place

**File**: [index.ts:264-304](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts#L264-L304)

The method signature says `Promise<void>` and mutates the input. This is a side-effect pattern. While it works, it's fragile — a caller might not expect `parseAsync()` to mutate the intermediate object.

### 9. `Swap` word in text `"Swap Punks for Azuki"` bypasses common word filter

The test `"Swap Punks for Azuki"` expects only 2 collection results, but `Swap` is an uppercase 4-letter word. It survives because it's not in `isCommonWord`. However, `"Swap"` matched as a fungible token symbol — it gets pushed as `{ symbol: "Swap", type: "fungible" }` which is a **false positive**. The test passes because it only checks `collections`, not total results.

### 10. Mixed indentation style across the codebase

`token.ts` mixes 2-space and 4-space indentation (e.g., NFT filter block uses 4-space while the rest uses 2-space). Inconsistent formatting.

---

## 🟢 Gaps & Missing Pieces

### 11. No test for `parseAsync` + token resolution flow

There's no integration test that verifies:
- `parseAsync` calls `resolveTokenAddresses`
- Addresses are correctly filled into `parameters`
- Warnings are added when resolution fails

### 12. No test for NFT detection within `parser.test.ts`

The `nft_purchase` intent exists but tests don't verify that `TokenExtractor`'s collection detection feeds into `mergeEntities` properly.

### 13. `enableFuzzyMatching` config option exists but does nothing

**File**: [types/index.ts:23](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/index.ts#L23)

The `ParserConfig.enableFuzzyMatching` field is defined but never read. When fuzzy matching gets implemented, this config should gate the feature.

### 14. No cache size limit on `TokenResolver`

The `Map<string, TokenCacheEntry>` grows unbounded. For long-running processes, this will leak memory. Consider adding a `maxCacheSize` option.

---

## Recommendations (Priority Order)

| # | Priority | Action |
|---|----------|--------|
| 1 | 🔴 High | Move `knownCollections` to constructor / class property |
| 2 | 🔴 High | Recalculate confidence in `parseAsync` after resolving addresses |
| 3 | 🔴 High | Wire `TokenExtractor`'s NFT detection into `mergeEntities` for `nft_purchase` |
| 4 | 🟡 Medium | Remove dead `tokenPatterns` field or use it |
| 5 | 🟡 Medium | Make `isCommonWord` Set a static/module constant |
| 6 | 🟡 Medium | Clean stale TODO comments in `token-resolver.ts` |
| 7 | 🟡 Medium | Fix misleading comment in `types/index.ts` about parse() becoming async |
| 8 | 🟢 Low | Add `parseAsync` integration tests |
| 9 | 🟢 Low | Add cache size limit to `TokenResolver` |
| 10 | 🟢 Low | Add "Swap" / "BUY" to common word filter to prevent false positive tokens |
