# Intent Parser SDK — Implementation Tasks

## Phase 1: Core Foundation (buildIntent + Tests)
- [x] Implement `buildIntent` in `src/index.ts`
- [x] Implement helper functions in `src/utils/parser-helpers.ts`
  - [x] `mergeEntities` (map entities to parameters)
  - [x] `calculateConfidence`
- [x] Create unit tests for extractors (`tests/extractors.test.ts`)
- [x] Verify test `parser.test.ts` pass

## Phase 2: Missing Templates & Extractors
- [x] Buat template `send` di `src/template/send.ts` *(fully implemented)*
- [x] Buat template `bridge` di `src/template/bridge.ts` *(fully implemented)*
- [x] Buat template `claim` di `src/template/claim.ts` *(fully implemented)*
- [x] Tambahkan `"claim"` ke `IntentType` dan claim fields ke `IntentParameters`
- [x] Tambahkan claim patterns ke `IntentClassifier`
- [x] Daftarkan template baru (`send`, `bridge`, `claim`) di `src/template/index.ts`
- [x] Tambahkan `claim` case ke `mergeEntities` di `parser-helpers.ts` *(full)*
- [x] Tambahkan `bridge` case ke `mergeEntities` *(full implementation with regex)*
- [x] Implementasi deadline extraction di `constraints.ts` *(regex implemented)*
- [x] Implementasi gas limit extraction di `constraints.ts` *(regex implemented)*
- [x] Implementasi price constraint extraction di `constraints.ts` *(regex implemented)*

## Phase 2 Bugfixes (from review)
- [x] 🔴 Fix double-escaped regex → replaced with `CHAIN_ALIASES` lookup map
- [x] 🔴 Tambah recipient extraction di `mergeEntities` case `send`
- [x] 🟡 Fix `/vest/i` → `/\bvest(?:ing|ed)?\b/i` di `intent-classifier.ts`
- [x] 🟡 Fix price regex false positive (negative lookahead for time words)
- [x] 🟡 Fix gas regex (requires 'gas' keyword nearby)
- [x] 🟢 Perketat ENS validation di `send.ts`
- [x] 🟢 Hapus residual TODO comments di `constraints.ts`

## Phase 3: Advanced Features
- [x] **Token Resolver (Swing.xyz API)** — resolve token symbol + chain → contract address
  - [x] Buat `src/services/token-resolver.ts` — service class dengan Swing.xyz API
  - [x] Buat `src/types/token.ts` — types untuk `ResolvedToken`, `TokenResolverConfig`
  - [x] Tambah `tokenResolver` config option di `ParserConfig` (`src/types/config.ts`)
  - [x] Integrasikan token resolver ke `buildIntent` di `src/index.ts`
  - [x] Isi `inputTokenAddress`, `outputTokenAddress` di `StructuredIntent`
  - [x] Built-in caching untuk hasil resolve (avoid repeated API calls)
  - [x] Support custom resolver override via config
- [x] NFT collection name detection di `token.ts`
- [x] Confidence scoring yang lebih akurat di `parser-helpers.ts`
- [ ] [OPTIONAL] Fuzzy matching support (Skeleton only)

## Phase 3 Bugfixes (from review)
- [x] 🔴 #1 Move `knownCollections` to class property in `token.ts`
- [x] 🔴 #2 Recalculate confidence in `parseAsync` after resolving addresses
- [x] 🔴 #3 Wire NFT detection from `TokenExtractor` into `mergeEntities`
- [x] 🔴 #4 Remove dead `tokenPatterns` field
- [x] 🟡 #5 Make `isCommonWord` Set a static constant
- [x] 🟡 #6 Clean stale TODO in `token-resolver.ts`
- [x] 🟡 #7 Fix misleading comment in `types/index.ts`
- [x] 🟡 #9 Add action words (Swap, Buy, etc.) to common word filter
- [x] 🟡 #10 Fix mixed indentation in `token.ts`
- [x] 🟢 #14 Add cache size limit to `TokenResolver`

## Phase 4: Testing & Polish
- [x] Tambah test untuk send, bridge, & claim intents
- [x] Tambah test untuk constraint extraction (deadline, gas, price)
- [x] Tambah test untuk token resolver (mock API, caching, fallback)
- [x] Tambah test untuk NFT collection detection
- [x] Tambah test untuk edge cases & error handling
- [x] Verifikasi `bun run build` sukses
- [x] Verifikasi contoh `examples/basic-usage.ts` berjalan
- [x] Buat dokumentasi fitur parser di `artifacts/parser-features.md`
