# System Architecture — Intent Parser SDK

> High-level overview of the SDK's components, data flows, and design decisions.

---

## Overview

The Intent Parser SDK is divided into two independently usable modules that work together as a complete intent-based bridging system:

```
                    ┌────────────────────────────────────┐
                    │           Developer App            │
                    └──────────────┬────────────────────┘
                                   │  createIntentSDK(config)
                    ┌──────────────▼────────────────────┐
                    │          SDK Entry Point           │
                    │     src/index.ts  +  src/solver    │
                    └──────┬──────────────┬─────────────┘
                           │              │
             ┌─────────────▼──┐    ┌──────▼──────────────┐
             │  IntentParser  │    │    IntentSolver       │
             │  (src/parser/) │    │  (src/solver/)        │
             └─────────────┬──┘    └──────────────────────┘
                           │
                    NLP Pipeline
                    │
          ┌─────────▼──────────────────────────────┐
          │                                         │
          ▼           ▼          ▼          ▼       ▼
     Tokenize   ClassifyType  Extract   Validate  Score
     (split)    (bridge/send)  (amount,  (Zod     (confidence)
                               token,    schema)
                               chain)
```

---

## Module Map

### `src/parser/` — Intent Parser

Converts plain English into a typed `StructuredIntent`.

```
parser/
├── index.ts                  ← IntentParser class (entry point)
├── classifiers/
│   └── intent-classifier.ts  ← Regex pattern → intentType
├── extractors/
│   ├── action.ts             ← Extract action verb (bridge/send/swap/...)
│   ├── amount.ts             ← Extract numeric amounts
│   ├── token.ts              ← Extract token symbols
│   ├── chain.ts              ← Map chain names to IDs
│   ├── address.ts            ← Extract 0x addresses and ENS
│   └── constraints.ts        ← Extract slippage, deadline, gas limits
├── validators/
│   └── schema.ts             ← Zod schema validation for StructuredIntent
└── utils/
    ├── normalize.ts          ← Text normalization (lowercase, strip symbols)
    └── parser-helpers.ts     ← Confidence scoring, entity merging
```

**Data flow:**
```
text → normalize → classify → [extract all entities] → validate → score → StructuredIntent
```

### `src/solver/` — Intent Solver

Autonomous cross-chain liquidity agent.

```
solver/
├── index.ts                  ← IntentSolver (public API)
├── agent/
│   ├── liquidity-agent.ts    ← Core orchestrator (canSolve, solve, lifecycle)
│   └── agent-config.ts       ← LiquidityAgentConfig schema + defaults
├── contracts/
│   └── intent-settlement/
│       ├── intent-settlement.ts         ← ethers-based contract wrapper
│       └── viem-settlement-contract.ts  ← viem-native wrapper (live settlement)
├── inventory/
│   ├── inventory-manager.ts  ← Balance tracking, lock/unlock, canFulfill
│   └── rebalancer.ts         ← Auto-rebalance via Li.Fi or Swing
├── mempool/
│   ├── mempool-client.ts     ← WebSocket listener for incoming intents
│   ├── mempool-monitor.ts    ← Orchestrates client + filter + submitter
│   ├── intent-filter.ts      ← Dedup cache (max 10k entries, FIFO pruning)
│   └── solution-submitter.ts ← Submit solutions back to mempool
├── monitoring/
│   ├── profit-tracker.ts     ← Track revenue, gas, success rates
│   ├── health-checker.ts     ← Check RPC/mempool/inventory health
│   └── alert-manager.ts      ← Structured alerts (INFO/WARNING/CRITICAL)
├── pricing/
│   ├── fee-calculator.ts     ← baseFee, gasCost calculation
│   ├── dynamic-pricing.ts    ← Inventory-aware multiplied pricing + shouldReject
│   └── slippage-capture.ts   ← Profit from user's slippage tolerance
├── protocols/
│   ├── base-protocol.ts      ← Abstract base class for all protocols
│   ├── protocol-registry.ts  ← Register + lookup bridge/lending protocols
│   ├── aggregators/
│   │   ├── lifi.ts           ← Li.Fi API integration (bridge aggregator)
│   │   └── swing.ts          ← Swing.xyz API integration (bridge aggregator)
│   └── lending/
│       └── aave.ts           ← Aave v3 APY reads + supply/withdraw builders
└── settlement/
    ├── settlement-manager.ts ← Settlement lifecycle, retry logic, watcher
    ├── proof-generator.ts    ← Generate CrossChainProof (sign tx data)
    └── proof-verifier.ts     ← Verify proofs by recovering signer address
```

### `src/shared/` — Shared Infrastructure

```
shared/
├── chain-registry/
│   └── registry.ts           ← ChainRegistry (chainId ↔ name mapping)
├── token-registry/
│   └── registry.ts           ← TokenRegistry (symbol ↔ address mapping)
├── rpc/
│   ├── provider-manager.ts   ← RPCProviderManager (multi-chain provider pool)
│   └── viem-provider.ts      ← ViemProvider (viem client + retry backoff)
├── wallet-manager/
│   └── wallet-manager.ts     ← WalletManager (sign, transfer, getAddress)
└── utils/
    ├── erc20-utils.ts         ← ABI-encode ERC-20 transfer/approve calls
    └── retry.ts               ← withRetry(fn, maxAttempts, backoffMs)
```

### `src/errors/` — Typed Error Classes

```
errors/
├── parser-errors.ts      ← ParseError
└── settlement-errors.ts  ← SettlementError, ClaimFailedError, ProofGenerationError,
                             UnsupportedIntentError, IntentExpiredError,
                             InsufficientInventoryError, SolverError
```

### `contracts/` — Smart Contracts

```
contracts/
└── IntentSettlement.sol  ← ERC-7683 compliant settlement contract
                             - UUPS upgradeable proxy pattern
                             - open() → locks user funds
                             - claim() → releases funds to solver after proof
                             - refund() → returns funds after fillDeadline
                             - isIntentSettled() → query settlement status
```

---

## End-to-End Data Flow

```
User Types: "Bridge 500 USDC from Ethereum to Polygon"
     │
     ▼
┌─────────────────────────────────────┐
│          IntentParser               │
│                                     │
│  1. normalize("bridge 500 usdc      │
│              from ethereum to       │
│              polygon")              │
│                                     │
│  2. classify → intentType="bridge"  │
│                                     │
│  3. extract →                       │
│       amount="500"                  │
│       token="USDC"                  │
│       sourceChain="1" (Ethereum)    │
│       targetChain="137" (Polygon)   │
│                                     │
│  4. validate (Zod schema)           │
│                                     │
│  5. confidence = 0.92               │
│                                     │
└──────────────┬──────────────────────┘
               │  StructuredIntent
               ▼
┌─────────────────────────────────────┐
│ Developer wraps in SolverIntent     │
│ { intentId, user, deadline, ... }   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                      IntentSolver                            │
│                                                              │
│  canSolve(intent)                                            │
│    ├─ bridge? ✓                                              │
│    ├─ chains supported? ✓                                    │
│    ├─ token supported? ✓                                     │
│    ├─ not expired? ✓                                         │
│    └─ canFulfill(137, USDC, 500 USDC)? ✓                    │
│                                                              │
│  getQuote(intent)                                            │
│    └─ DynamicPricing → { baseFee=2.5, gasCost=1, total=4 }  │
│                                                              │
│  solve(intent)                                               │
│    1. Re-check deadline (race guard B9)                      │
│    2. DynamicPricing.shouldReject? No                        │
│    3. InventoryManager.lock(137, USDC, 500)                  │
│    4. WalletManager.sendERC20(                               │
│          targetChain=137,                                    │
│          to=userAddress, token=USDC, amount=496)             │
│       → txHash = 0x1a2b3c...                                 │
│    5. InventoryManager.deduct(137, USDC, 500)                │
│    6. ProofGenerator.generateSignatureProof(...)             │
│    7. Contract.claim(order, solverSignature)                 │
│       → releases 500 USDC to solver on source chain         │
│                                                              │
│  → SolutionResult { success: true,                           │
│                     txHash: "0x1a2b3c...",                   │
│                     profit: "4000000" }                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Just-In-Time Liquidity Model

The solver pre-positions inventory on target chains and fills intents instantly. Settlement (recovering capital from source chain) happens asynchronously and is retried automatically if it fails.

### 2. Simulate / Live Mode Split

`mode: "simulate"` generates deterministic fake `txHash` values, enabling full unit and integration testing without network access. `mode: "live"` uses the same code path but signs a real `walletClient.writeContract()` call.

### 3. Settlement Failure is Non-Fatal

If the settlement contract call fails (network issue, nonce conflict), the `solve()` still returns `success: true` because the user already received their funds. The `SettlementManager` retries the claim up to `maxClaimRetries` times. When all retries fail, `onPermanentFailure` is invoked so operators can be alerted.

### 4. BigInt Safety

All token amounts are handled as `bigint` throughout the codebase to avoid JavaScript number precision issues for large balances. Conversion to `number` is only done for the inventory capacity ratio via `safeCapacityRatio()` which clamps to `Number.MAX_SAFE_INTEGER` before converting.

### 5. Typed Error Hierarchy

All error classes extend `SolverError` (which extends `Error`) with a `code` string field. This allows `instanceof` checks and structured logging without parsing error messages.

### 6. IntentFilter Bounded Cache

The mempool dedup cache is bounded to `maxCacheSize` (default: 10,000 entries). When full, the oldest 20% of entries are pruned (FIFO) to prevent unbounded memory growth in long-running solver processes.

### 7. ERC-7683 Compliance

The `IntentSettlement.sol` contract implements ERC-7683 cross-chain intents standard with:
- `open()` — user locks funds
- `claim()` — solver claims with proof
- `refund()` — user reclaims if solver doesn't fill before `fillDeadline`
- UUPS upgradeable proxy for seamless contract upgrades

---

## TypeScript Type System

Key types exported from the SDK:

```typescript
// from src/types/common.ts
type Address = `0x${string}`;
type Hash = `0x${string}`;
type ChainId = number;

// from src/parser/types.ts (internal) / src/types/templates.ts
interface StructuredIntent {
    intentType: IntentType;
    parameters: IntentParameters;
    constraints: IntentConstraints;
    metadata: { confidence: number; parsedAt: number; rawText?: string };
}

// from src/solver/types/intent.ts
interface SolverIntent {
    intentId: string;
    intentHash: Hash;
    user: Address;
    signature: string;
    deadline: number;
    status: IntentStatus;
    receivedAt: number;
    solver?: Address;
    parsedIntent: StructuredIntent;
}

// from src/solver/types/pricing.ts
interface PricingResult {
    baseFee: bigint;
    gasCost: bigint;
    slippageCapture: bigint;
    totalFee: bigint;
    userPays: bigint;
    userReceives: bigint;
    solverProfit: bigint;
    inventoryMultiplier: number;
}
```

---

## Test Coverage Map

| Test File | What It Tests |
|-----------|--------------|
| `tests/parser/parser.test.ts` | IntentParser — all intent types, edge cases |
| `tests/parser/constraints.test.ts` | (T10) Constraint extraction mapping |
| `tests/solver/pricing.test.ts` | FeeCalculator, DynamicPricing, SlippageCapture, T3 edge cases |
| `tests/solver/settlement.test.ts` | ProofGenerator, ProofVerifier, SettlementManager, T4 retry |
| `tests/solver/protocols.test.ts` | Li.Fi, Swing, Aave, ProtocolRegistry |
| `tests/solver/inventory.test.ts` | InventoryManager, Rebalancer |
| `tests/solver/monitoring.test.ts` | ProfitTracker, HealthChecker, AlertManager |
| `tests/solver/agent.test.ts` | LiquidityAgent — canSolve, solve, concurrency |
| `tests/shared/retry.test.ts` | withRetry backoff logic |
| `tests/shared/viem-provider.test.ts` | ViemProvider (live RPC, requires network) |
| `tests/integration/pipeline.test.ts` | (T9, T7) Parser→Solver full pipeline integration |
| `tests/live/` | Live testnet tests (requires funded wallet + RPC) |
| `tests/e2e/` | Full E2E on Unichain Sepolia testnet |
