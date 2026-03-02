# Phase 1 Implementation Review

## Summary

Overall Phase 1 is **functional** — all tests pass. However there are **7 issues** I found, categorized by severity.

---

## 🔴 Bugs (Must Fix)

### 1. `calculateConfidence` calls `mergeEntities` without `text`
[parser-helpers.ts:L22](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts#L22)

```typescript
// Current (line 22):
const parameters = mergeEntities(entities, intentType);
// Missing the 3rd arg → risk/collection logic never runs during confidence calc
```

This means `calculateConfidence` doesn't account for keyword-derived parameters like `riskLevel`, `collection`, `diversificationRequired` when checking required/optional field coverage. Confidence scores for `yield_strategy` and `nft_purchase` will be **lower than expected**.

**Fix**: Pass the text through or restructure so `calculateConfidence` receives the already-merged parameters from `buildIntent` instead of re-calling `mergeEntities`.

---

### 2. `buildIntent` puts `parsedAt` in **constraints** object
[index.ts:L155-L158](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts#L155-L158)

```typescript
const constraints = {
  ...template.defaultConstraints,
  parsedAt: Date.now(),   // ← Wrong place. parsedAt belongs in metadata
};
```

`parsedAt` is already correctly added to `metadata` on line 181. Putting it in `constraints` too is a **data pollution bug** — every constraint object will have an unexpected `parsedAt` field (though Zod uses `.passthrough()` so it silently passes validation).

**Fix**: Remove `parsedAt: Date.now()` from the constraints block.

---

### 3. Missing `deadline` constraint in `buildIntent`
[index.ts:L155](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts#L155)

The `IntentConstraints` type requires `deadline: number` and the Zod schema has `deadline: z.number()` (not optional). Currently `deadline` is only set if the template includes it in `defaultConstraints`. The `unknownTemplate` sets `deadline: 0` which works, but there's no logic to compute a real deadline from `config.defaultDeadlineOffset`. The config field `defaultDeadlineOffset: 3600` is never used.

**Fix**: Add `deadline: Date.now() + this.config.defaultDeadlineOffset * 1000` as a fallback.

---

## 🟡 Code Quality Issues

### 4. First regex pattern matches without requiring a suffix
[amount.ts:L119](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/amount.ts#L119)

```regex
/(?<value>\d+(?:\.\d+)?)\s*(?<suffix>[km]?)\s*(?<unit>[A-Z]{2,10})/gi
```

The `gi` flags make this case-insensitive, which means `[A-Z]{2,10}` also matches lowercase words like `"and"`, `"the"`, `"safe"`. For example, parsing `"I want safe protocols"` will match `"safe"` as a unit. The overlap filter helps, but it's still extracting false positives.

**Fix**: Either remove the `i` flag from the first pattern, or use `[A-Z]{2,10}` without `i` flag so only uppercase token symbols are matched.

### 5. `template/index.ts` type mismatch

```typescript
// Line 1: imports IntentType
import type { IntentTemplate, IntentType } from "../types";

// Line 12: Map uses string instead of IntentType
private templates: Map<string, IntentTemplate>;
```

The `Map` type was changed from `IntentType` to `string` during debugging. This weakens type safety — any string key is now accepted.

**Fix**: Revert to `Map<IntentType, IntentTemplate>`.

### 6. Leftover blank line + stale comments

- [parser-helpers.ts:L83-L84](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts#L83-L84): Extra blank line in `swap` case from removed code
- [index.ts:L70](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts#L70): `// TODO: Implement parsing logic` — already implemented
- [parser-helpers.ts:L126-L127](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts#L126-L127): Stale `// For now, we look for collection...` comment

---

## 🟢 Test Coverage Gaps

### 7. Commented-out test + missing edge cases in `extractors.test.ts`
[extractors.test.ts:L41-L44](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/extractors.test.ts#L41-L44)

- The "should ignore common words" test is **commented out** — this means we don't verify that `TokenExtractor` filters common English words
- No test for `AmountExtractor` when text has **no amounts** (empty result)
- No test for `AmountExtractor` handling **negative numbers** or **invalid input**
- No test for `ActionExtractor` when **no action** is found
- `parser.test.ts` doesn't assert `metadata.confidence` is within expected range

---

## Recommendation

Issues **#1, #2, #3** are real bugs that should be fixed before moving to Phase 2. Issues **#4–#7** are improvements that can be addressed during or after Phase 2, but #4 (regex `gi` flag) may cause subtle failures with certain inputs.

Shall I proceed with fixing these?
