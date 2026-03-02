# Intent Parser SDK — Workflow & Architecture Guide

> Dokumen ini menjelaskan keseluruhan alur kerja (workflow) dari **Intent Parser SDK**, 
> mulai dari parsing bahasa natural hingga eksekusi settlement on-chain.

---

## Gambaran Umum

SDK ini terdiri dari dua komponen utama:

| Komponen | Fungsi | Entry Point |
|----------|--------|-------------|
| **IntentParser** | Mengubah perintah bahasa natural menjadi structured intent | `parser.parse(text)` |
| **IntentSolver** | Mengeksekusi intent tersebut sebagai liquidity agent cross-chain | `solver.solve(intent)` |

Keduanya dapat digunakan secara terpisah atau digabungkan melalui factory function `createIntentSDK()`.

```typescript
import { createIntentSDK } from "intent-parser-sdk";

const sdk = createIntentSDK({
    agent: {
        privateKey: "0x...",
        supportedChains: [1, 10, 42161],
        supportedTokens: ["USDC", "USDT"]
    },
    contractAddress: "0x..."
});
```

---

## Stage 1: Intent Parser

### Apa Itu Intent?

Intent adalah **niat pengguna** yang diekspresikan dalam bahasa natural, contoh:
- *"Bridge 100 USDC from Ethereum to Arbitrum"*
- *"Send 50 USDT to 0xAbc..."*
- *"Swap 1 ETH for USDC on Uniswap with max slippage 1%"*

### Alur Parsing

```
User Text Input
      │
      ▼
┌─────────────────────┐
│   IntentParser       │
│                      │
│  1. Tokenization     │  ← Memecah teks menjadi token-token
│  2. Template Match   │  ← Mencocokkan pola: bridge, send, swap, claim, yield
│  3. Entity Extract   │  ← Mengekstrak: amount, token, chain, address
│  4. Constraint Parse │  ← Mengekstrak: slippage, deadline, priority
│  5. Confidence Score │  ← Menghitung tingkat keyakinan (0-1)
│                      │
└─────────┬───────────┘
          │
          ▼
   ParseResult / StructuredIntent
   {
     intentType: "bridge",
     parameters: {
       inputAmount: "100",
       inputToken: "USDC",
       sourceChain: "1",
       targetChain: "42161",
       ...
     },
     constraints: {
       maxSlippage: 50,  // basis points
       deadline: 1708300000
     },
     confidence: 0.85
   }
```

### Template yang Didukung

| Template | Contoh Input | Intent Type |
|----------|-------------|-------------|
| **Bridge** | "Bridge 100 USDC to Arbitrum" | `bridge` |
| **Send** | "Send 50 USDT to 0xAbc..." | `send` |
| **Swap** | "Swap 1 ETH for USDC" | `swap` |
| **Claim** | "Claim rewards from staking" | `claim` |
| **Yield** | "Deposit 1000 USDC into yield strategy" | `yield_strategy` |

### Contoh Penggunaan Parser

```typescript
const result = await sdk.parser.parse("Bridge 100 USDC from Ethereum to Arbitrum");

console.log(result.intentType);    // "bridge"
console.log(result.parameters);    // { inputAmount: "100", inputToken: "USDC", ... }
console.log(result.confidence);    // 0.85
```

---

## Stage 2: Intent Solver

Solver adalah **Liquidity Agent** yang bertindak sebagai "market maker" untuk cross-chain bridging.

### Konsep Bisnis

Alih-alih user menunggu proses bridge tradisional yang lambat:

1. **Solver menalangi dana** → Mengirim token dari inventory sendiri ke user di chain tujuan secara instan
2. **Solver mengklaim dana asli** → Mengambil token asli milik user (+ fee) dari chain asal melalui smart contract settlement

Ini membuat pengalaman bridging menjadi **instan** bagi user, sementara solver mendapat **profit dari fee**.

### Arsitektur Internal Solver

```
                    ┌─────────────────────────────────┐
                    │         IntentSolver             │  ← Public API
                    │  initialize() / start() / stop() │
                    │  getQuote() / canSolve() / solve()│
                    └────────────┬────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                       │
          ▼                      ▼                       ▼
   ┌──────────────┐    ┌─────────────────┐     ┌────────────────┐
   │ Mempool Layer │    │ LiquidityAgent  │     │  Monitoring    │
   │               │    │  (Orchestrator) │     │                │
   │ MempoolClient │    │                 │     │ ProfitTracker  │
   │ IntentFilter  │    │                 │     └────────────────┘
   │ SolutionSubmit│    │                 │
   │ MempoolMonitor│    └───┬─────┬───┬──┘
   └───────────────┘        │     │   │
                            ▼     ▼   ▼
                   ┌────────┐ ┌───┐ ┌──────────┐
                   │Inventory│ │Fee│ │Settlement│
                   │Manager  │ │Eng│ │Manager   │
                   │         │ │ine│ │          │
                   │BalanceTrack│ │  │ │ProofGen  │
                   │Lock/Unlock │ │  │ │ProofVerify│
                   │Rebalancer  │ │  │ │Contract  │
                   └────────────┘ └──┘ └──────────┘
```

---

### Workflow Lengkap: Solve Intent

Berikut adalah alur lengkap saat sebuah intent diproses oleh solver:

#### Fase 1: Penerimaan Intent

```
Mempool Server (WebSocket)
        │
        │  Event: "new_intent"
        ▼
┌───────────────────┐
│  MempoolMonitor    │
│                    │
│  Menerima intent   │──→ stats.received++
│  dari WebSocket    │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  IntentFilter      │
│                    │
│  ✓ Chain didukung? │
│  ✓ Token didukung? │
│  ✓ Belum expired?  │
│  ✓ Belum solved?   │──→ Jika TIDAK lolos → skip, return
│                    │
└────────┬──────────┘
         │ Lolos filter
         ▼
```

#### Fase 2: Pricing & Validasi

```
┌───────────────────────┐
│  DynamicPricing        │
│                        │
│  Menghitung fee:       │
│  ├─ baseFee           │  ← Fee dasar (bps dari amount)
│  ├─ gasCost           │  ← Estimasi gas di target chain
│  ├─ slippageCapture   │  ← Margin dari slippage allowance
│  ├─ inventoryMultiply │  ← Pengali berdasarkan sisa inventory
│  │   (inventory rendah │     └→ fee naik / reject)
│  │    inventory tinggi │     └→ fee turun)
│  └─ totalFee          │
│                        │
│  shouldReject()?       │──→ Jika inventory terlalu rendah → tolak
└────────┬──────────────┘
         │
         ▼
```

#### Fase 3: Lock & Execute

```
┌──────────────────────────┐
│  InventoryManager         │
│                           │
│  lockAmount()             │  ← Mengunci saldo di target chain
│  (agar tidak double-spend │     agar intent lain tidak pakai
│   jika ada 2 intent       │     dana yang sama)
│   bersamaan)              │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  LiquidityAgent           │
│  sendOnTargetChain()      │
│                           │
│  Mode "simulate":         │
│  → Generate fake TxHash   │
│                           │
│  Mode "live" (Stage 3):   │
│  → ERC-20 transfer()      │
│  → Kirim token ke user    │
│    di TARGET CHAIN        │
└────────┬─────────────────┘
         │
         │  Jika GAGAL:
         │  → unlockAmount() → kembalikan inventory
         │  → return { success: false }
         │
         │  Jika BERHASIL:
         ▼
┌──────────────────────────┐
│  InventoryManager         │
│  confirmDeduction()       │  ← Kurangi saldo permanen
└────────┬─────────────────┘
         │
         ▼
```

#### Fase 4: Settlement (Klaim Dana)

```
┌──────────────────────────┐
│  ProofGenerator           │
│                           │
│  1. Ambil TxReceipt dari  │
│     target chain          │
│  2. Buat message digest   │
│     (intentId + txHash +  │
│      amount + recipient)  │
│  3. Sign dengan private   │
│     key solver (EIP-191)  │
│  4. Return CrossChainProof│
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  ProofVerifier            │
│                           │
│  Verifikasi signature     │
│  recovered address ==     │
│  solver address?          │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  IntentSettlement (Smart Contract)│
│  (di SOURCE CHAIN)                │
│                                   │
│  claimSettlement(proof)           │
│  → Verifikasi proof on-chain     │
│  → Transfer dana user + fee      │
│    ke wallet solver               │
│  → Emit event "SettlementClaimed" │
└──────────────────────────────────┘
```

#### Fase 5: Result

```
┌──────────────────────────┐
│  SolutionResult           │
│                           │
│  {                        │
│    success: true,         │
│    txHash: "0xabc...",    │
│    profit: "50000",       │  ← Fee yang diperoleh solver
│    output: "99950000",    │  ← Jumlah yang diterima user
│    metadata: {            │
│      solveDurationMs: 850,│
│      sourceChainId: 1,    │
│      targetChainId: 42161,│
│      feeBreakdown: {...}  │
│    }                      │
│  }                        │
└──────────────────────────┘
```

---

### Background: Rebalancing

Setelah solver beroperasi dan melayani banyak intent, distribusi inventory bisa menjadi tidak merata. Contoh:

```
Sebelum rebalance:
  Ethereum (chain 1):    500,000 USDC  (75%)  ← kebanyakan
  Arbitrum (chain 42161): 100,000 USDC (15%)  ← terlalu sedikit
  Optimism (chain 10):    66,000 USDC  (10%)  ← terlalu sedikit

Sesudah rebalance:
  Ethereum:  222,000 USDC  (33%)
  Arbitrum:  222,000 USDC  (33%)
  Optimism:  222,000 USDC  (33%)
```

`Rebalancer` secara otomatis mendeteksi ketidakseimbangan dan menggunakan bridge aggregator (seperti Swing) untuk memindahkan dana solver sendiri antar chain.

---

## Mode Penggunaan SDK

### 1. Manual Mode (Parse + Solve)

```typescript
const sdk = createIntentSDK(config);
await sdk.solver.initialize();

// Parse input dari user
const parsed = await sdk.parser.parse("Bridge 100 USDC to Arbitrum");

// Buat SolverIntent
const intent = buildSolverIntent(parsed); // helper function

// Cek apakah bisa di-solve
if (sdk.solver.canSolve(intent)) {
    const quote = sdk.solver.getQuote(intent);
    console.log("Fee:", quote.totalFee);
    
    const result = await sdk.solver.solve(intent);
    console.log("Success:", result.success);
}
```

### 2. Autonomous Mode (Background Listener)

```typescript
const sdk = createIntentSDK(config);
await sdk.solver.initialize();

// Connect ke mempool dan dengarkan intent secara otomatis
sdk.solver.start("wss://mempool.example.com");

// Monitor stats secara periodik
setInterval(() => {
    const stats = sdk.solver.getStats();
    console.log("Solved:", stats.mempoolStats.solved);
    console.log("Profit:", stats.profitStats.totalProfit);
}, 5000);

// Hentikan kapan saja
// sdk.solver.stop();
```

### 3. Parser-Only Mode

```typescript
import { IntentParser } from "intent-parser-sdk";

const parser = new IntentParser();
const result = await parser.parse("Swap 1 ETH for USDC on Uniswap");
// Gunakan result.parameters untuk integrasi dengan sistem lain
```

---

## Daftar Modul & File Utama

### Parser (Stage 1)

| File | Fungsi |
|------|--------|
| `src/parser/index.ts` | Entry point parser |
| `src/parser/tokenizer.ts` | Tokenisasi input text |
| `src/parser/templates/*.ts` | Template per intent type (bridge, send, swap, claim, yield) |
| `src/parser/constraints.ts` | Ekstraksi constraint (slippage, deadline, priority) |
| `src/parser/parser-helpers.ts` | Merge entities, normalisasi token/chain |
| `src/types/intent.ts` | Type definitions: `StructuredIntent`, `ParseResult` |

### Solver (Stage 2)

| File | Fungsi |
|------|--------|
| `src/solver/index.ts` | **IntentSolver** — public wrapper |
| `src/solver/agent/liquidity-agent.ts` | **LiquidityAgent** — orchestrator utama |
| `src/solver/agent/agent-config.ts` | Konfigurasi agent (chains, tokens, fees) |
| `src/solver/inventory/inventory-manager.ts` | Manajemen saldo per chain dan lock/unlock |
| `src/solver/inventory/rebalancer.ts` | Auto-rebalance inventory antar chain |
| `src/solver/pricing/dynamic-pricing.ts` | Kalkulasi fee dinamis berdasarkan inventory |
| `src/solver/pricing/fee-calculator.ts` | Komponen fee: base, gas, slippage |
| `src/solver/settlement/proof-generator.ts` | Generate cross-chain proof (EIP-191 signature) |
| `src/solver/settlement/proof-verifier.ts` | Verifikasi signature proof |
| `src/solver/settlement/settlement-manager.ts` | Orchestrator settlement + retry logic |
| `src/solver/contracts/intent-settlement/` | Smart contract wrapper |
| `src/solver/mempool/mempool-client.ts` | WebSocket client ke mempool server |
| `src/solver/mempool/mempool-monitor.ts` | Background listener + pipeline orchestrator |
| `src/solver/mempool/intent-filter.ts` | Filter intent berdasarkan capability solver |
| `src/solver/mempool/solution-submitter.ts` | Submit solusi ke mempool |
| `src/solver/monitoring/profit-tracker.ts` | Tracking profit dan ROI |
| `src/solver/protocols/aggregators/swing.ts` | Bridge aggregator (Swing.xyz) |
| `src/solver/protocols/lending/aave.ts` | Lending protocol (Aave) — stub |

### Shared

| File | Fungsi |
|------|--------|
| `src/shared/wallet-manager/wallet-manager.ts` | Manajemen private key & signing |
| `src/shared/rpc/provider-manager.ts` | Koneksi ke RPC nodes per chain |
| `src/shared/chain-registry/registry.ts` | Registry data chain (nama, chainId, RPC URL) |
| `src/shared/token-registry/registry.ts` | Registry data token (symbol, decimals, address) |

---

## Status Saat Ini

| Kategori | Status |
|----------|--------|
| Parser (Stage 1) | ✅ **Produksi-siap** — semua template & test lulus |
| Solver Logic (Stage 2) | ✅ **Fitur lengkap** — semua modul terkoneksi |
| Smart Contract | ✅ **Deployed di Hardhat** — test suite lulus |
| Eksekusi Live (RPC) | ⏳ **Mock** — hanya simulate mode yang aktif |
| Mempool Server | ⏳ **Mock** — belum ada backend server nyata |
| Bridge Aggregator | ⏳ **Stub** — Swing API belum diintegrasikan |
| Lending Protocol | ⏳ **Stub** — Aave adapter belum diimplementasikan |

> **Stage 3** akan fokus pada penggantian semua mock layer dengan koneksi live
> ke testnet (Sepolia, Arbitrum Goerli) dan API pihak ketiga yang sesungguhnya.
