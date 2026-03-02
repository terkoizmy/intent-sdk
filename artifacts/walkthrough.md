# Walkthrough — Phase 1 Complete

## Changes Made

### Initial Implementation
- Implemented `buildIntent` in `src/index.ts` connecting extractors → templates → structured intent
- Implemented `mergeEntities` and `calculateConfidence` in `src/utils/parser-helpers.ts`
- Added `AmountExtractor` overlap filtering and k/m suffix support
- Created `unknown` template for graceful unknown intent handling
- Created unit tests for all extractors and the parser

### Review Fixes (7 issues)

| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | 🔴 Bug | `parser-helpers.ts` | `calculateConfidence` now takes pre-merged parameters instead of re-calling `mergeEntities` without text |
| 2 | 🔴 Bug | `index.ts` | Removed erroneous `parsedAt` from constraints object |
| 3 | 🔴 Bug | `index.ts` | `deadline` now uses `config.defaultDeadlineOffset` |
| 4 | 🟡 Quality | `amount.ts` | Regex flag `gi` → `g` to stop matching lowercase words as tokens |
| 5 | 🟡 Quality | `template/index.ts` | Restored `Map<IntentType, IntentTemplate>` type safety |
| 6 | 🟡 Quality | Multiple | Cleaned stale TODO comments and blank lines |
| 7 | 🟢 Tests | `extractors.test.ts` | Uncommented common words test, added 4 edge case tests, added confidence assertion |

## Verification

```
bun test — EXIT_CODE: 0, 0 failures
```

All tests pass:
- `extractors.test.ts`: 11 tests (amounts, tokens, actions, constraints + edge cases)
- `parser.test.ts`: 5 tests (swap, yield, NFT, unknown, slippage)

---

## Phase 2 Scaffolding

### Full Implementations (Phase 2 Complete)
| File | Change |
|------|--------|
| [intent.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/intent.ts) | Added `"claim"` to `IntentType`, `ClaimType`, claim fields |
| [claim.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/claim.ts) | Full claim template with validation |
| [send.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/send.ts) | **[Implemented]** Validation, required params, address/ENS regex |
| [bridge.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/bridge.ts) | **[Implemented]** Validation, cross-chain verification, params |
| [intent-classifier.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/classifiers/intent-classifier.ts) | Added claim patterns |
| [parser-helpers.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts) | **[Implemented]** Bridge chain detection regex & Claim logic |
| [constraints.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/constraints.ts) | **[Implemented]** Regex for deadline, gas limit, and price constraints |

### Verification
```
bun test — 17 pass, 0 fail (no regressions)
```

## Phase 3: Advanced Features Implementation (Complete)

### Changes Made
- **Token Resolver**: Implemented `TokenResolver` service (`src/services/token-resolver.ts`) using Swing.xyz API for real-time token address resolution.
  - Features: Caching (5min TTL), Batch Resolution, Custom Resolver support.
  - Integrated via `parseAsync()` to maintain backward compatibility.
- **NFT Detection**: Added NFT collection detection to `TokenExtractor` (`src/extractors/token.ts`).
  - Supports: Bored Ape, Mutant Ape, Punks, Azuki, Doodles, etc.
  - Prioritized over fungible tokens to prevent overlap.
- **Confidence Scoring**: Enhanced `calculateConfidence` in `src/utils/parser-helpers.ts`.
  - Added penalties for unknown intents and missing required fields.
  - Added bonuses for resolved token addresses, explicit chains, and risk levels.
- **Fuzzy Matching**: Added skeleton for future implementation (currently disabled/optional).

### Verification Results
Tests executed with `bun test`:
- `tests/extractors.test.ts`: **Passed** (14 tests) - Verified NFT detection and known token extraction.
- `tests/token-resolver.test.ts`: **Passed** (9 tests) - Verified API integration, caching, and batching.
- `tests/parser.test.ts`: **Passed** (5 tests) - Verified overall parsing logic.

**Total**: 28 tests passed, 0 failures.

---
