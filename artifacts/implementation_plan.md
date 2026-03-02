# Intent Parser SDK — Implementation Plan

SDK ini sudah punya kerangka arsitektur yang baik, tapi beberapa bagian kunci belum diimplementasi. Plan ini dibagi menjadi **4 phase** yang diurutkan berdasarkan dependensi — setiap phase membangun di atas phase sebelumnya.

---

## Phase 1: Core Foundation 🏗️

> Tujuan: Membuat SDK bisa berjalan end-to-end untuk intent **swap**, **yield_strategy**, dan **nft_purchase** yang sudah punya template.

### [MODIFY] [index.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts)

Implementasi method `buildIntent()` (line 135-143) yang saat ini `throw new Error("Not implemented")`:

1. **Map extracted entities ke template parameters** — gunakan `mergeEntities()` dari `parser-helpers.ts`
2. **Isi default values** dari template untuk field yang tidak ditemukan di teks
3. **Build constraints** — gabungkan extracted constraints dengan `defaultConstraints` dari template
4. **Hitung confidence score** — gunakan `calculateConfidence()` dari `parser-helpers.ts`
5. **Set metadata** — `originalText`, `parsedAt` (timestamp), `confidence`, dan `warnings`

```diff
  private buildIntent(
    intentType: string,
    entities: any,
    template: any,
    originalText: string,
  ): StructuredIntent {
-   throw new Error("Not implemented");
+   // 1. Merge entities into parameters
+   // 2. Apply template defaults
+   // 3. Build constraints
+   // 4. Calculate confidence
+   // 5. Return StructuredIntent with metadata
  }
```

### [MODIFY] [parser-helpers.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts)

Perbaiki `mergeEntities()` agar lebih cerdas memetakan entity ke parameter berdasarkan intent type:
- **Swap**: token pertama = `inputToken`, token kedua = `outputToken`, amount = `inputAmount`
- **Yield**: token pertama = `inputToken`, amount = `inputAmount`
- **NFT**: deteksi collection name, amount = `maxPrice`

Perbaiki `calculateConfidence()` agar memperhitungkan jumlah required fields yang terisi.

### [MODIFY] [extractors.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/extractors.test.ts)

File ini kosong. Tulis unit tests untuk setiap extractor:
- `AmountExtractor`: test angka biasa, suffix k/m, desimal
- `TokenExtractor`: test simbol token, filter kata umum, known token address
- `ActionExtractor`: test kata kerja dan kategori
- `ConstraintExtractor`: test slippage extraction

---

## Phase 2: Missing Templates & Extractors 📦 (DONE)

> [!IMPORTANT]
> Phase 2 selesai. Template **send**, **bridge**, dan **claim** sudah diimplementasikan sepenuhnya, termasuk constraint extraction regex.

> Tujuan: Dukung semua 5 intent types dan lengkapi extraction untuk constraints.

### [NEW] [send.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/send.ts)

Template baru untuk `send` intent:
- **Required**: `inputToken`, `inputAmount`, `recipient`
- **Optional**: `maxGasCost`
- **Default**: deadline = 0 (dynamic)

### [NEW] [bridge.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/bridge.ts)

Template baru untuk `bridge` intent:
- **Required**: `inputToken`, `inputAmount`, `sourceChain`, `targetChain`
- **Optional**: `outputToken`, `maxSlippage`
- **Default**: deadline = 0, maxSlippage = 100

### [NEW] [claim.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/claim.ts)

Template baru untuk `claim` intent:
- **Required**: `inputToken`
- **Optional**: `inputAmount`, `protocol`, `claimType`
- **Default**: claimType = `"rewards"`, deadline = 0 (dynamic)
- **Use cases**: "Claim my AERO airdrop", "Claim staking rewards from ETH", "Claim 500 vested ARB"

### [MODIFY] [intent.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/intent.ts)

Tambahkan `"claim"` ke union type `IntentType` dan field claim-specific ke `IntentParameters`:
- `claimType?: "airdrop" | "rewards" | "vesting"`
- `protocol?: string`

### [MODIFY] [intent-classifier.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/classifiers/intent-classifier.ts)

Tambahkan pattern untuk `claim`:
- `/claim/i`, `/collect.*reward/i`, `/withdraw.*reward/i`, `/vest/i`

### [MODIFY] [template/index.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/template/index.ts)

Daftarkan template `send`, `bridge`, dan `claim` ke `TemplateRegistry`.

### [MODIFY] [constraints.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/constraints.ts)

Implementasi extraction untuk:
- **Deadline**: `"within 1 hour"`, `"in 30 minutes"` → detik
- **Gas limit**: `"max 0.01 ETH gas"`, `"gas limit 100 gwei"`
- **Price constraint**: `"max price 10 ETH"`, `"under 1000 USDC"`

### [MODIFY] [parser-helpers.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts)

Tambahkan logic `mergeEntities` untuk intent type `send`, `bridge`, dan `claim`:
- **Send**: deteksi recipient (address/ENS), map `inputToken`, `inputAmount`
- **Bridge**: deteksi chain names (`Ethereum`, `Polygon`, `Arbitrum`, dll)
- **Claim**: deteksi claimType dari keyword (airdrop/rewards/vesting), map `inputToken`, `protocol`

---

## Phase 3: Advanced Features 🚀

> Tujuan: Tambah Token Resolver (Swing.xyz API) untuk resolve token address secara otomatis, serta fitur NLP lanjutan.

### 3A. Token Resolver — Swing.xyz API ⭐ (Fitur Utama)

> [!IMPORTANT]
> `IntentParameters` sudah punya field `inputTokenAddress` dan `outputTokenAddress` (line 47, 51 di `intent.ts`), tapi belum pernah diisi. Token Resolver akan mengisi field ini secara otomatis.

**API endpoint**: `https://platform.swing.xyz/api/v1/tokens?chain={chain}&symbol={symbol}`
- Public API, tidak perlu API key
- Support EVM chains + Solana
- Return: `address`, `decimals`, `name`, `price`, `chain`

#### [NEW] [token-resolver.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/services/token-resolver.ts)

Service class `TokenResolver`:
- `resolve(symbol: string, chain: string): Promise<ResolvedToken | null>`
- Built-in cache menggunakan `Map<string, ResolvedToken>` dengan TTL (default: 5 menit)
- Cache key format: `"${symbol.toUpperCase()}:${chain.toLowerCase()}"`
- Fallback graceful jika API down — return `null`, parser tetap berfungsi tanpa address
- Configurable timeout (default: 5000ms)

```typescript
// Contoh penggunaan internal
const resolved = await tokenResolver.resolve("USDC", "polygon");
// → { address: "0x3c499c...", decimals: 6, symbol: "USDC", chain: "polygon" }
```

#### [NEW] [token.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/token.ts) (types)

Type definitions:
```typescript
interface ResolvedToken {
  symbol: string;
  address: string;
  decimals: number;
  chain: string;
  name?: string;
  price?: number;
}

interface TokenResolverConfig {
  enabled: boolean;           // default: true
  cacheTTL: number;           // default: 300000 (5 min)
  timeout: number;            // default: 5000ms
  customResolver?: (symbol: string, chain: string) => Promise<ResolvedToken | null>;
}
```

#### [MODIFY] [config.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/types/config.ts)

Tambah `tokenResolver?: TokenResolverConfig` ke `ParserConfig`:

```diff
 export interface ParserConfig {
   defaultDeadlineOffset: number;
+  tokenResolver?: TokenResolverConfig;
 }
```

#### [MODIFY] [index.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts)

Integrasikan Token Resolver ke `IntentParser`:
1. Inisialisasi `TokenResolver` di constructor berdasarkan config
2. Di `buildIntent()` — setelah `mergeEntities`, call resolver untuk mengisi `inputTokenAddress` dan `outputTokenAddress`
3. Karena resolver async (API call), `parse()` dan `buildIntent()` menjadi **async**
4. Jika `customResolver` disediakan di config, gunakan itu sebagai ganti Swing.xyz
5. Jika resolve gagal, set warning di `metadata.warnings` — parser tetap return intent tanpa address

**Flow**:
```
"swap 10 USDC to ETH on Ethereum"
  → mergeEntities: { inputToken: "USDC", outputToken: "ETH" }
  → TokenResolver.resolve("USDC", "ethereum") → { address: "0xA0b8..." }
  → TokenResolver.resolve("ETH", "ethereum") → { address: "0xEeee..." }
  → parameters.inputTokenAddress = "0xA0b8..."
  → parameters.outputTokenAddress = "0xEeee..."
```

> [!WARNING]
> Mengubah `parse()` dari sync ke async adalah **breaking change**. Consumer yang sudah pakai `parser.parse(text)` harus ubah ke `await parser.parse(text)`.
>
> **Mitigasi**: Sediakan flag `tokenResolver.enabled = false` di config untuk mempertahankan behavior sync.

---

### 3B. NFT Collection Detection

#### [MODIFY] [token.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/extractors/token.ts)

Implementasi NFT collection name detection:
- Pattern: `"Bored Ape"`, `"CryptoPunks"`, `"Azuki"`
- Tambahkan `type: "collection"` pada `TokenEntity`

### 3C. Improved Confidence Scoring

#### [MODIFY] [parser-helpers.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/utils/parser-helpers.ts)

Upgrade `calculateConfidence()`:
- Faktor: % required fields terisi, pattern match strength, ambiguity detection
- Bonus jika `inputTokenAddress` berhasil di-resolve (token valid)
- Range yang lebih granular (bukan cuma 0.5 + bonus)

### 3D. Fuzzy Matching

#### [MODIFY] [index.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/index.ts)

- **Fuzzy matching** — support typo (`"swpa"` → `"swap"`) menggunakan Levenshtein distance

---

## Phase 4: Testing & Polish ✅

> Tujuan: Pastikan semuanya solid dan production-ready.

### [MODIFY] [parser.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/parser.test.ts)

Tambah test cases:
- Send intent: `"Send 0.5 ETH to 0x1234..."`
- Bridge intent: `"Bridge 100 USDC from Ethereum to Polygon"`
- Claim intent: `"Claim my AERO airdrop"`, `"Claim staking rewards from ETH"`
- Token resolver: verify `inputTokenAddress` terisi setelah resolve
- Edge cases: empty string, gibberish, very long text
- Batch parsing test

### [NEW] [token-resolver.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/token-resolver.test.ts)

Test suite untuk Token Resolver:
- Mock Swing.xyz API response
- Cache hit/miss behavior
- Timeout dan error handling
- Custom resolver override
- Graceful fallback when API is down

### [MODIFY] [extractors.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/extractors.test.ts)

Tambah test coverage untuk:
- Deadline, gas, price constraint extraction
- NFT collection detection
- Edge cases per extractor

---

## Verification Plan

### Automated Tests

Setiap phase diverifikasi dengan menjalankan test suite:

```bash
# Jalankan semua tests
bun test

# Jalankan test spesifik
bun test tests/parser.test.ts
bun test tests/extractors.test.ts
bun test tests/token-resolver.test.ts
```

**Phase 1 target**: `parser.test.ts` — semua 5 test cases harus pass
**Phase 2 target**: Test baru untuk send/bridge + constraint extraction harus pass
**Phase 3 target**: Token resolver integration + NFT collection detection harus pass
**Phase 4 target**: Semua tests pass, build sukses

### Build Verification

```bash
# Verify build berhasil tanpa error
bun run build
```

### Example Verification

```bash
# Jalankan contoh penggunaan dan pastikan output terstruktur benar
bun run examples/basic-usage.ts
```

Output yang diharapkan: setiap example menghasilkan `{ success: true, data: { intentType: "...", parameters: { ..., inputTokenAddress: "0x..." }, constraints: {...}, metadata: {...} } }`.
