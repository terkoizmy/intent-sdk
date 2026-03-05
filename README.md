# 🔗 Intent Parser SDK

> **Parse natural language blockchain intents. Solve them cross-chain. Automatically.**

`@terkoizmy/intent-sdk` is a TypeScript SDK that converts everyday language like *"Bridge 500 USDC from Ethereum to Polygon"* into structured, executable blockchain transactions — while an autonomous solver agent handles the cross-chain execution, fee optimization, and settlement proof on your behalf.

[![npm version](https://img.shields.io/npm/v/@terkoizmy/intent-sdk)](https://www.npmjs.com/package/@terkoizmy/intent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)

---

## ✨ What It Does

| Capability | Description |
|-----------|-------------|
| 🧠 **Natural Language Parsing** | Turn plain English into structured `StructuredIntent` objects |
| ⚡ **Cross-Chain Bridging** | Autonomous solver executes bridge intents across EVM chains |
| 💰 **Dynamic Fee Pricing** | Fee scales with inventory levels, gas costs, and user slippage tolerance |
| 🔒 **Settlement Proofs** | ERC-7683–compliant on-chain settlement with signature proof verification |
| 📊 **Monitoring & Alerting** | Built-in `ProfitTracker`, `HealthChecker`, and `AlertManager` |
| 🔄 **Auto-Rebalancing** | Inventory rebalancer uses Li.Fi or Swing to keep liquidity optimally distributed |
| 🛡️ **Battle-Tested Error Handling** | Domain-specific error classes and retry logic with exponential backoff |

---

## 📦 Installation

```bash
# npm
npm install @terkoizmy/intent-sdk

# bun
bun add @terkoizmy/intent-sdk

# yarn
yarn add @terkoizmy/intent-sdk

# pnpm
pnpm add @terkoizmy/intent-sdk
```

**Requirements:** Node.js ≥ 18 or Bun ≥ 1.0

---

## 🚀 Quick Start

### 1. Parse-Only (No Solver)

```typescript
import { IntentParser } from "@terkoizmy/intent-sdk";

const parser = new IntentParser();
const result = parser.parse("Bridge 500 USDC from Ethereum to Polygon");

if (result.success) {
    console.log(result.data);
    // {
    //   intentType: "bridge",
    //   parameters: {
    //     inputToken: "USDC",
    //     inputAmount: "500",
    //     sourceChain: "1",
    //     targetChain: "137",
    //     recipient: undefined
    //   },
    //   constraints: { maxSlippage: 50 },
    //   metadata: { confidence: 0.92, parsedAt: 1709123456789 }
    // }
}
```

### 2. Parser + Solver (Simulate Mode)

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { parser, solver } = createIntentSDK({
    solver: {
        agent: {
            privateKey: process.env.SOLVER_PRIVATE_KEY!,
            mode: "simulate",                         // No real transactions
            supportedChains: [1, 10, 42161, 137],     // ETH, OP, ARB, Polygon
            supportedTokens: ["USDC", "USDT"],
            maxConcurrentIntents: 5,
        },
        contractAddress: "0xYOUR_SETTLEMENT_CONTRACT",
    },
});

await solver.initialize();

// Parse + solve in one flow
const { data: intent } = parser.parse("Bridge 200 USDC from Ethereum to Arbitrum");
const solverIntent = buildSolverIntent(intent, userAddress, deadline);

if (solver.canSolve(solverIntent)) {
    const quote = solver.getQuote(solverIntent);
    console.log(`Fee: ${quote.totalFee} | User gets: ${quote.userReceives}`);

    const result = await solver.solve(solverIntent);
    console.log(result);
    // { success: true, txHash: "0x...", profit: "4500000", metadata: { ... } }
}
```

### 3. Autonomous Mode (Live Mempool Listener)

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { solver } = createIntentSDK({
    solver: {
        agent: {
            privateKey: process.env.SOLVER_PRIVATE_KEY!,
            mode: "live",                              // Real ERC-20 transfers
            supportedChains: [1, 10, 42161],
            supportedTokens: ["USDC", "USDT"],
        },
        contractAddress: process.env.SETTLEMENT_CONTRACT!,
        settlement: {
            onPermanentFailure: (intentId, error, attempts) => {
                console.error(`Intent ${intentId} failed permanently after ${attempts} tries: ${error}`);
                // Send alert, page on-call, etc.
            },
        },
    },
});

await solver.initialize();

// Connect to mempool — solver handles everything automatically
solver.start("wss://mempool.yourprotocol.com/ws");

// Poll stats every 30s
setInterval(() => {
    const stats = solver.getStats();
    console.log("Solved:", stats.mempoolStats.solved);
    console.log("Total Profit:", stats.profitStats.totalProfit);
    console.log("Success Rate:", `${(stats.profitStats.successCount / stats.profitStats.totalAttempts * 100).toFixed(1)}%`);
}, 30_000);

// Graceful shutdown
process.on("SIGINT", () => {
    solver.stop();
    process.exit(0);
});
```

---

## 🧠 Supported Intent Types

| Type | Example Phrases |
|------|----------------|
| **`bridge`** | *"Bridge 100 USDC from Ethereum to Arbitrum"* |
| **`send`** | *"Send 50 USDT to 0xAbc..."* or *"Transfer 0.1 ETH to alice.eth"* |
| **`swap`** | *"Swap 1 ETH for USDC on Uniswap with max 1% slippage"* |
| **`claim`** | *"Claim my ARB airdrop"* / *"Claim staking rewards from Aave"* |
| **`yield_strategy`** | *"Deposit 1000 USDC for safe yield"* / *"degen high APY"* |

### Parser Output Shape

```typescript
interface StructuredIntent {
    intentType: "bridge" | "send" | "swap" | "claim" | "yield_strategy" | "unknown";
    parameters: IntentParameters;  // inputToken, inputAmount, sourceChain, targetChain, recipient, etc.
    constraints: {
        maxSlippage?: number;      // basis points (100 = 1%)
        deadline?: number;        // unix timestamp
        maxGasCost?: string;      // in native token
        preferredDEXs?: string[];
        minProtocols?: number;
        // ... and more
    };
    metadata: {
        confidence: number;       // 0 to 1 — how confident the parser is
        parsedAt: number;        // unix ms timestamp
        rawText?: string;        // original user input
    };
}
```

---

## 🌐 Supported Chains

### Mainnets

| Chain | ID | Notes |
|-------|----|----|
| Ethereum | `1` | Primary liquidity hub |
| Optimism | `10` | L2 — low gas |
| Arbitrum One | `42161` | L2 — low gas |
| Polygon | `137` | Fast finality |

### Testnets

| Chain | ID | Settlement Contract |
|-------|----|---------------------|
| Unichain Sepolia | `1301` | [`0x7066f6...`](https://unichain-sepolia.blockscout.com/address/0x7066f6dFc1C652c165Bc9BB10085fD95719b5eA6) ✅ Deployed |
| Ethereum Sepolia | `11155111` | — |
| Arbitrum Sepolia | `421614` | — |
| Base Sepolia | `84532` | — |

> Add any EVM chain by supplying its `chainId` in `supportedChains` and an RPC URL.

---

## 💸 Fee Structure

The solver earns fees on every successful solve:

```
totalFee = baseFee + gasCost + slippageCapture
```

| Component | Default | Description |
|-----------|---------|-------------|
| `baseFee` | 0.5% | Service charge on bridge amount |
| `gasCost` | Dynamic | Estimated destination-chain gas |
| `slippageCapture` | 50% of user's tolerance | Profit from unused slippage |

### Dynamic Inventory Multiplier

When liquidity on the target chain is low, fees adjust automatically:

| Capacity | Multiplier | Behavior |
|----------|-----------|----------|
| ≥ 80% | **0.8×** | Discount — aggressively fill to rebalance |
| 50–79% | **1.0×** | Normal pricing |
| 20–49% | **1.5×** | Premium — inventory getting scarce |
| 5–19% | **2.0×** | High premium |
| < 5% | **Rejected** | Intent declined — not enough liquidity |

---

## 🛡️ Error Handling

The SDK exposes typed error classes for precise catch handling:

```typescript
import {
    IntentExpiredError,
    InsufficientInventoryError,
    UnsupportedIntentError,
    ClaimFailedError,
    ProofGenerationError,
    SettlementError,
} from "@terkoizmy/intent-sdk";

try {
    const result = await solver.solve(intent);
} catch (error) {
    if (error instanceof IntentExpiredError) {
        // Intent deadline passed — ignore or notify user
        console.warn("Deadline passed, skipping intent.");
    } else if (error instanceof InsufficientInventoryError) {
        // Not enough tokens on target chain
        console.error(`Low inventory on chain ${error.chainId}`);
    } else if (error instanceof ClaimFailedError) {
        // Settlement claim on source chain failed
        console.error(`Claim failed: ${error.reason}`);
    } else {
        throw error; // Rethrow unexpected errors
    }
}
```

---

## 🔧 Configuration Reference

```typescript
createIntentSDK({
    solver: {
        agent: {
            privateKey: "0x...",             // Required — solver wallet private key
            mode: "simulate" | "live",       // Required — simulate or real transactions
            name?: "MySolver",               // Optional name
            supportedChains: [1, 137],       // Which chain IDs to service
            supportedTokens: ["USDC"],       // Which tokens to handle
            maxConcurrentIntents?: 5,        // Parallel solve limit (default: 5)
        },
        contractAddress: "0x...",            // IntentSettlement.sol proxy address

        rpcUrls?: {                          // Optional override — fallback to public RPCs
            1: "https://eth.rpc.example.com",
            137: "https://polygon.rpc.example.com",
        },

        pricing?: {
            baseFeePercent?: 0.005,          // 0.5% base fee (default)
            minFeeUSD?: 1,                   // Minimum $1 USDC (default)
            maxFeePercent?: 0.03,            // 3% cap (default)
            slippageSharePercent?: 0.5,      // Capture 50% of user's tolerance (default)
        },

        inventory?: {
            minReservePercent?: 0.10,        // Keep 10% in reserve (default)
            rebalanceThreshold?: 0.15,       // Trigger rebalance at 15% imbalance (default)
        },

        settlement?: {
            requiredConfirmations?: 3,       // Blocks before proof is generated (default: 3)
            maxClaimRetries?: 3,             // Max retry attempts (default: 3)
            watchIntervalMs?: 30_000,        // Watcher poll interval (default: 30s)
            onPermanentFailure?: (intentId, error, attempts) => void,  // Failure callback
        },
    },
});
```

---

## ⚙️ Environment Variables

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLVER_PRIVATE_KEY` | ✅ | Solver wallet private key (hex, with `0x`) |
| `UNICHAIN_SEPOLIA_RPC_URL` | ✅ for testnet | RPC endpoint for Unichain Sepolia |
| `SEPOLIA_RPC_URL` | Optional | Ethereum Sepolia RPC |
| `ARB_SEPOLIA_RPC_URL` | Optional | Arbitrum Sepolia RPC |
| `BASE_SEPOLIA_RPC_URL` | Optional | Base Sepolia RPC |
| `ETH_RPC_URL` | Optional | Ethereum Mainnet (Aave reads) |
| `SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA` | For live settlement | Deployed contract proxy address |

---

## 📖 API Reference

### `IntentParser`

```typescript
const parser = new IntentParser(config?: ParserConfig);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `parse(text)` | `ParseResult` | Parse a single natural language intent (sync) |
| `parseBatch(texts[])` | `ParseResult[]` | Parse multiple intents at once (sync) |

### `IntentSolver`

```typescript
const solver = new IntentSolver(config: LiquidityAgentConfig);
```

| Method | Description |
|--------|-------------|
| `initialize()` | Load on-chain balances, derive solver address. **Call before anything else.** |
| `start(mempoolUrl)` | Connect to mempool WebSocket and autonomously solve intents |
| `stop()` | Gracefully disconnect and stop all background work |
| `canSolve(intent)` | Returns `true` if the solver supports this intent type, chain, token, and has enough inventory |
| `getQuote(intent)` | Returns full `PricingResult` fee breakdown without executing anything |
| `solve(intent)` | Execute full solve → settlement flow. Returns `SolutionResult` |
| `getStatus()` | Returns `"idle"` or `"processing"` |
| `getStats()` | Returns `{ profitStats, mempoolStats }` |

### `createIntentSDK(config)` — Factory

Returns `{ parser, solver }` — the easiest way to get started:

```typescript
const { parser, solver } = createIntentSDK(config);
// parser → IntentParser
// solver → IntentSolver (wraps LiquidityAgent + all subsystems)
```

---

## 📂 Project Structure

```
src/
├── parser/           ← IntentParser — NLP-to-structured-intent engine
│   ├── classifiers/  ← Intent type detection (bridge/send/swap/...)
│   ├── extractors/   ← Amount, token, chain, action extraction
│   ├── validators/   ← Zod schema validation
│   └── utils/        ← Normalization, confidence scoring
├── solver/           ← IntentSolver — autonomous liquidity agent
│   ├── agent/        ← LiquidityAgent, AgentConfig
│   ├── contracts/    ← ViemSettlementContract (ERC-7683 wrapper)
│   ├── inventory/    ← InventoryManager, Rebalancer (Li.Fi / Swing)
│   ├── mempool/      ← MempoolClient, IntentFilter, SolutionSubmitter
│   ├── monitoring/   ← ProfitTracker, HealthChecker, AlertManager
│   ├── pricing/      ← DynamicPricing, FeeCalculator, SlippageCapture
│   ├── protocols/    ← Li.Fi (bridge aggregator), Aave (lending), Swing
│   └── settlement/   ← ProofGenerator, ProofVerifier, SettlementManager
├── shared/           ← Reusable utilities
│   ├── rpc/          ← ViemProvider (with retry backoff), RPCProviderManager
│   ├── utils/        ← ERC-20 ABI utils, withRetry
│   ├── chain-registry/ ← Chain configs, name resolvers
│   ├── token-registry/ ← Token metadata
│   └── wallet-manager/ ← WalletManager (sign, transfer)
├── errors/           ← Domain-specific typed error classes
├── types/            ← Shared TypeScript interfaces
└── config/           ← Chain configs, default pricing, testnet RPC URLs
contracts/            ← IntentSettlement.sol (ERC-7683 + UUPS upgradeable)
tests/
├── parser/           ← Parser unit tests
├── solver/           ← Solver unit tests (pricing, settlement, protocols)
├── shared/           ← Shared utility tests (retry, viem, chain registry)
├── integration/      ← Mock-based full pipeline tests
├── live/             ← Live testnet tests (requires funded wallet + RPC)
└── e2e/              ← End-to-end testnet tests
docs/                 ← Full documentation
examples/             ← Runnable code examples
```

---

## 📚 Documentation

| Document | What You'll Find |
|----------|-----------------|
| [docs/USAGE.md](./docs/USAGE.md) | Full usage guide with all features and code samples |
| [docs/SOLVER.md](./docs/SOLVER.md) | Solver architecture, config reference, fee structure, API |
| [docs/SDK_WORKFLOW.md](./docs/SDK_WORKFLOW.md) | End-to-end workflow diagrams (Parser → Solver → Settlement) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture, component map, data flows |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Deploy the IntentSettlement smart contract |
| [docs/TESTNET_GUIDE.md](./docs/TESTNET_GUIDE.md) | Faucets, wallet funding, troubleshooting on testnets |
| [docs/ERC_STANDARDS.md](./docs/ERC_STANDARDS.md) | ERC-7683, ERC-712 standards used in settlement |

---

## 💡 Examples

| File | Description |
|------|-------------|
| [`examples/basic-bridge.ts`](./examples/basic-bridge.ts) | Parse and manually solve a bridge intent |
| [`examples/autonomous-agent.ts`](./examples/autonomous-agent.ts) | Fully autonomous mempool listener agent |
| [`examples/inventory-management.ts`](./examples/inventory-management.ts) | Inventory snapshot + auto-rebalancing |

```bash
# Run an example
npx tsx examples/basic-bridge.ts
```

---

## 🧪 Development

```bash
# Install dependencies
bun install

# Build TypeScript
bun run build

# Run all tests (no network needed)
bun test tests/parser/ tests/solver/ tests/shared/ tests/integration/

# Run specific suites
bun test tests/parser/           # parser unit tests
bun test tests/solver/           # solver unit tests
bun test tests/integration/      # integration pipeline tests

# Tests requiring a funded wallet + RPC
bun test tests/live/             # live testnet tests
bun test tests/e2e/              # full E2E pipeline

# Type check only
bun run build --noEmit
```

---

## 🤝 Contributing

Pull requests are welcome! Please:
1. Run `bun test` and confirm all non-live tests pass
2. Run `bun run build` and confirm no TypeScript errors
3. Follow the existing code style (typed catch blocks, no `any`, typed interfaces)

---

## 📄 License

MIT © 2024 [@terkoizmy](https://github.com/terkoizmy)
