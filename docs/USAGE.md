# Usage Guide — Intent Parser SDK

> **Complete how-to guide for `@terkoizmy/intent-sdk`.**
> Covers every feature from basic parsing to autonomous solver deployment.

---

## Table of Contents

1. [Installation](#-installation)
2. [Parser — Natural Language to Intent](#-parser--natural-language-to-intent)
   - [Basic Parsing](#basic-parsing)
   - [Parser Configuration](#parser-configuration)
   - [Batch Parsing](#batch-parsing)
   - [All Supported Intent Types](#all-supported-intent-types)
   - [Understanding Confidence Scores](#understanding-confidence-scores)
3. [Solver — Execute Intents Cross-Chain](#-solver--execute-intents-cross-chain)
   - [Creating a Solver](#creating-a-solver)
   - [Simulate vs Live Mode](#simulate-vs-live-mode)
   - [The Solve Lifecycle](#the-solve-lifecycle)
   - [Getting a Quote](#getting-a-quote)
   - [Error Handling](#error-handling)
4. [Full SDK Factory](#-full-sdk-factory-createintentsdk)
5. [Autonomous Mode](#-autonomous-mode--mempool-listener)
6. [Monitoring & Stats](#-monitoring--stats)
7. [Inventory Management](#-inventory-management)
8. [Fee Pricing System](#-fee-pricing-system)
9. [Settlement & Proof Generation](#-settlement--proof-generation)
10. [Environment Configuration](#-environment-configuration)

---

## 📦 Installation

```bash
npm install @terkoizmy/intent-sdk   # npm
bun add @terkoizmy/intent-sdk       # bun
yarn add @terkoizmy/intent-sdk      # yarn
pnpm add @terkoizmy/intent-sdk      # pnpm
```

**Requirements:** Node.js ≥ 18 or Bun ≥ 1.0, TypeScript ≥ 5.0

---

## 🧠 Parser — Natural Language to Intent

### Basic Parsing

`IntentParser.parse()` is **synchronous** and returns immediately:

```typescript
import { IntentParser } from "@terkoizmy/intent-sdk";

const parser = new IntentParser();

// Bridge intent
const result = parser.parse("Bridge 500 USDC from Ethereum to Polygon");

if (result.success) {
    const intent = result.data!;
    console.log(intent.intentType);          // "bridge"
    console.log(intent.parameters.inputToken);   // "USDC"
    console.log(intent.parameters.inputAmount);  // "500"
    console.log(intent.parameters.sourceChain);  // "1"   (Ethereum)
    console.log(intent.parameters.targetChain);  // "137" (Polygon)
    console.log(intent.metadata.confidence);     // 0.92
} else {
    console.error("Parse failed:", result.error);
}
```

### Parser Configuration

```typescript
const parser = new IntentParser({
    defaultDeadlineOffset: 3600,      // seconds until intent expires (default: 1 hour)
    minConfidence: 0.5,               // minimum confidence threshold (default: 0.0)
    knownTokens: {                    // optional address hints for known tokens
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
});
```

### Batch Parsing

Parse multiple intents in one call:

```typescript
const results = parser.parseBatch([
    "Bridge 100 USDC from Ethereum to Arbitrum",
    "Send 50 USDT to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "Claim my ARB airdrop",
    "Deposit 1000 USDC for safe yield",
]);

results.forEach((r, i) => {
    if (r.success) {
        console.log(`[${i}] ${r.data!.intentType} — confidence: ${r.data!.metadata.confidence}`);
    }
});
```

### All Supported Intent Types

#### 🔀 Bridge

Move tokens across chains:

```typescript
parser.parse("Bridge 100 USDC from Ethereum to Arbitrum");
parser.parse("Cross-chain transfer 500 USDT to Polygon");
parser.parse("Move 0.5 ETH from Arbitrum to Base");
```

Output:
```typescript
{
    intentType: "bridge",
    parameters: {
        inputToken: "USDC",
        inputAmount: "100",
        sourceChain: "1",    // resolved chain ID
        targetChain: "42161",
    }
}
```

#### 📤 Send / Transfer

Send tokens to an address:

```typescript
parser.parse("Send 10 USDC to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
parser.parse("Transfer 0.1 ETH to alice.eth");
```

Output:
```typescript
{
    intentType: "send",
    parameters: {
        inputToken: "USDC",
        inputAmount: "10",
        recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    }
}
```

#### 🔁 Swap

Exchange one token for another:

```typescript
parser.parse("Swap 1 ETH for USDC on Uniswap with max 1% slippage");
parser.parse("Convert 500 USDT to ETH");
```

Output:
```typescript
{
    intentType: "swap",
    parameters: {
        inputToken: "ETH",
        inputAmount: "1",
        outputToken: "USDC",
    },
    constraints: {
        maxSlippage: 100,      // 100 basis points = 1%
        preferredDEXs: ["uniswap"],
    }
}
```

#### 🪙 Claim

Claim airdrops or staking rewards:

```typescript
parser.parse("Claim my ARB airdrop");
parser.parse("Claim staking rewards from Aave");
parser.parse("Collect my UNI governance rewards");
```

Output:
```typescript
{
    intentType: "claim",
    parameters: {
        claimType: "airdrop",   // or "rewards", "governance", "yield"
        token: "ARB",
        protocol: "aave",       // if protocol mentioned
    }
}
```

#### 📈 Yield Strategy

Deposit into yield protocols:

```typescript
parser.parse("Maximize yield on 1000 USDC safely");
parser.parse("Put 500 USDC into degen high yield strategies");
parser.parse("Stake 5 ETH for best APY");
```

Output:
```typescript
{
    intentType: "yield_strategy",
    parameters: {
        inputToken: "USDC",
        inputAmount: "1000",
        riskLevel: "low",       // "low", "medium", "high"
        diversificationRequired: false,
    }
}
```

### Understanding Confidence Scores

```typescript
const result = parser.parse("Bridge some USDC");
console.log(result.data?.metadata.confidence);
// 0.45 — low confidence because amount is missing

const result2 = parser.parse("Bridge 100 USDC from Ethereum to Polygon");
console.log(result2.data?.metadata.confidence);
// 0.92 — high confidence, all fields present
```

Confidence reflects how complete and unambiguous the intent text is:
- **≥ 0.8** — high confidence, all key fields extracted
- **0.5–0.8** — medium confidence, some fields inferred
- **< 0.5** — low confidence, fallback values used

---

## ⚙️ Solver — Execute Intents Cross-Chain

### Creating a Solver

```typescript
import { IntentSolver } from "@terkoizmy/intent-sdk";

const solver = new IntentSolver({
    agent: {
        privateKey: process.env.SOLVER_PRIVATE_KEY!,
        mode: "simulate",
        supportedChains: [1, 137, 42161, 10],
        supportedTokens: ["USDC", "USDT", "ETH"],
        maxConcurrentIntents: 5,
    },
    contractAddress: "0xYOUR_SETTLEMENT_CONTRACT",
});

// ALWAYS initialize before using
await solver.initialize();
```

### Simulate vs Live Mode

| Mode | Behavior | Use Case |
|------|----------|----------|
| `"simulate"` | Generates a deterministic fake `txHash`. No signatures. No real transactions. | Unit tests, local dev, CI/CD |
| `"live"` | Signs and broadcasts a real ERC-20 `transfer()` via `walletClient`. | Staging, production |

```typescript
// Simulate mode (safe for testing)
const solver = new IntentSolver({ agent: { mode: "simulate", ... } });

// Live mode (real blockchain transactions)
const solver = new IntentSolver({ agent: { mode: "live", ... } });
```

### The Solve Lifecycle

```typescript
import type { SolverIntent } from "@terkoizmy/intent-sdk";

// Build a SolverIntent from parsed data
const intent: SolverIntent = {
    intentId: crypto.randomUUID(),
    intentHash: "0x...",           // keccak256 of the intent data
    user: "0xUSER_ADDRESS",
    signature: "0x...",            // user's EIP-191 signature
    deadline: Math.floor(Date.now() / 1000) + 3600,
    status: "pending",
    receivedAt: Date.now(),
    solver: solver.agent.agentAddress,
    parsedIntent: result.data!,    // from IntentParser
};

// Step 1: Check eligibility
if (!solver.canSolve(intent)) {
    console.log("Cannot solve — check chain/token support or inventory");
    return;
}

// Step 2: Get price quote (no execution)
const quote = solver.getQuote(intent);
console.log("Base fee:", quote.baseFee.toString());
console.log("Gas cost:", quote.gasCost.toString());
console.log("Slippage capture:", quote.slippageCapture.toString());
console.log("Total fee:", quote.totalFee.toString());
console.log("User receives:", quote.userReceives.toString());
console.log("Solver profit:", quote.solverProfit.toString());

// Step 3: Execute
const result = await solver.solve(intent);

if (result.success) {
    console.log("Solved! txHash:", result.txHash);
    console.log("Profit:", result.profit);
    console.log("Duration:", result.metadata?.solveDurationMs, "ms");
}
```

### Getting a Quote

```typescript
const quote = solver.getQuote(intent);

// PricingResult shape:
// {
//   baseFee: bigint,         // solver's service charge
//   gasCost: bigint,         // estimated gas on target chain
//   slippageCapture: bigint, // profit from unused slippage
//   totalFee: bigint,        // baseFee + gasCost + slippageCapture
//   userPays: bigint,        // amount locked by user on source chain
//   userReceives: bigint,    // amount user gets on target chain
//   solverProfit: bigint,    // totalFee - gasCost
//   inventoryMultiplier: number, // 0.8x / 1.0x / 1.5x / 2.0x
// }
```

### Error Handling

```typescript
import {
    IntentExpiredError,
    InsufficientInventoryError,
    UnsupportedIntentError,
    ClaimFailedError,
    ProofGenerationError,
    SettlementError,
    SolverError,
} from "@terkoizmy/intent-sdk";

try {
    await solver.solve(intent);
} catch (error) {
    if (error instanceof IntentExpiredError) {
        // Intent deadline passed — skip it
        console.warn(`Intent ${error.intentId} expired.`);

    } else if (error instanceof InsufficientInventoryError) {
        // Not enough tokens on target chain — wait for rebalance
        console.warn(`Insufficient inventory for ${error.token} on chain ${error.chainId}`);

    } else if (error instanceof UnsupportedIntentError) {
        // Wrong intent type or chain — skip
        console.warn("Intent type/chain not supported.");

    } else if (error instanceof ClaimFailedError) {
        // Settlement claim failed — the watcher will retry automatically
        console.error(`Claim failed for ${error.intentId}: ${error.reason}`);

    } else if (error instanceof ProofGenerationError) {
        // Could not generate or verify settlement proof
        console.error("Proof error:", error.message);

    } else {
        throw error; // Unexpected — rethrow
    }
}
```

---

## 🏭 Full SDK Factory: `createIntentSDK`

The easiest way to get both parser and solver:

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { parser, solver } = createIntentSDK({
    solver: {
        agent: {
            privateKey: process.env.SOLVER_PRIVATE_KEY!,
            mode: "live",
            supportedChains: [1, 10, 42161, 137],
            supportedTokens: ["USDC", "USDT"],
            maxConcurrentIntents: 10,
        },
        contractAddress: process.env.SETTLEMENT_CONTRACT!,
        rpcUrls: {
            1:     process.env.ETH_RPC_URL!,
            10:    process.env.OP_RPC_URL!,
            42161: process.env.ARB_RPC_URL!,
            137:   process.env.POLYGON_RPC_URL!,
        },
        pricing: {
            baseFeePercent: 0.005,       // 0.5% base fee
            minFeeUSD: 1,                // min $1
            maxFeePercent: 0.03,         // max 3%
            slippageSharePercent: 0.5,   // capture 50% of slippage buffer
        },
        inventory: {
            minReservePercent: 0.1,      // keep 10% in reserve
            rebalanceThreshold: 0.15,    // rebalance if > 15% imbalanced
        },
        settlement: {
            requiredConfirmations: 3,
            maxClaimRetries: 3,
            watchIntervalMs: 30_000,
            onPermanentFailure: (intentId, error, attempts) => {
                // Alert your on-call team here
                sendAlert(`Settlement permanently failed: ${intentId} after ${attempts} tries: ${error}`);
            },
        },
    },
});

await solver.initialize();
```

---

## 🤖 Autonomous Mode — Mempool Listener

The solver can automatically watch a mempool WebSocket and solve intents as they arrive:

```typescript
// Start autonomous listening
solver.start("wss://mempool.yourprotocol.com/ws");

// The solver will:
// 1. Receive new SolverIntent messages from WebSocket
// 2. Filter duplicates with IntentFilter (dedup cache, max 10k entries)
// 3. Call canSolve() — reject unsupported/expired/insufficient intents
// 4. Call solve() — lock inventory, send funds, generate proof
// 5. Submit solution via SolutionSubmitter
// 6. Track stats via ProfitTracker
// 7. Retry failed claims automatically after watchIntervalMs

// Monitor stats
const intervalId = setInterval(() => {
    const { profitStats, mempoolStats } = solver.getStats();
    console.log(`[Stats]`);
    console.log(`  Received: ${mempoolStats.received}`);
    console.log(`  Filtered: ${mempoolStats.filtered}`);
    console.log(`  Solved:   ${mempoolStats.solved}`);
    console.log(`  Failed:   ${mempoolStats.failed}`);
    console.log(`  Success Rate: ${(profitStats.successCount / profitStats.totalAttempts * 100).toFixed(1)}%`);
    console.log(`  Total Profit: ${profitStats.totalProfit}`);
}, 30_000);

// Graceful shutdown
process.on("SIGINT", () => {
    clearInterval(intervalId);
    solver.stop();
    process.exit(0);
});
```

---

## 📊 Monitoring & Stats

### Health Check

```typescript
const health = await solver.healthChecker.check();

// {
//   healthy: true,
//   checks: {
//     mempool: { connected: true },
//     rpc: { allHealthy: true, results: Map<chainId, boolean> },
//     inventory: { hasInventory: true },
//   }
// }
```

### Profit Stats

```typescript
const { profitStats } = solver.getStats();

// {
//   totalAttempts: 145,
//   successCount: 138,
//   failCount: 7,
//   totalProfit: "415000000",   // in token smallest unit (e.g., USDC 6 decimals = $415)
//   totalGasCost: "82000000",
//   avgProfit: "3007246",
// }
```

### Mempool Stats

```typescript
const { mempoolStats } = solver.getStats();

// {
//   received: 200,     // total intents received
//   filtered: 55,      // duplicates or unsupported, filtered out
//   solved: 138,       // successfully solved
//   failed: 7,         // solve errors
// }
```

### Alerts

```typescript
import { AlertManager } from "@terkoizmy/intent-sdk";

const alertManager = solver.alertManager;

// Get all alerts (useful for dashboards)
const criticals = alertManager.getAlerts("CRITICAL");

// {
//   level: "CRITICAL",
//   message: "Failed claim for intent 0x...",
//   data: { intentId, reason, attempt },
//   timestamp: 1709123456789
// }
```

---

## 🏦 Inventory Management

### View Current Balances

```typescript
await solver.inventoryManager.loadBalances();

const snapshot = solver.inventoryManager.getSnapshot();
// {
//   "1:USDC": 5000000000n,    // 5000 USDC on Ethereum
//   "137:USDC": 8000000000n,  // 8000 USDC on Polygon
//   "42161:USDC": 2000000000n // 2000 USDC on Arbitrum
// }
```

### Check Fulfillability

```typescript
const canFulfill = solver.inventoryManager.canFulfill(
    137,            // chainId
    "USDC",         // token symbol
    500_000_000n    // 500 USDC (6 decimals)
);
// true / false
```

### Trigger Manual Rebalance

```typescript
// The rebalancer uses Li.Fi or Swing.xyz to redistribute liquidity
await solver.inventoryManager.rebalancer?.autoRebalance("USDC");
```

---

## 💰 Fee Pricing System

### Get Dynamic Price

```typescript
const priceResult = solver.dynamicPricing.getPrice(intent);

console.log("Inventory multiplier:", priceResult.inventoryMultiplier); // 0.8x / 1.0x / 1.5x / 2.0x
console.log("Total fee:", priceResult.totalFee.toString());
```

### Check Rejection Threshold

```typescript
// Returns true if inventory is too low to accept this intent
const shouldReject = solver.dynamicPricing.shouldReject(137, 1000_000_000n);
```

### Inventory Multiplier Tiers

| Target Chain Capacity | Multiplier | Meaning |
|-----------------------|-----------|---------|
| ≥ 80% of total | **0.8×** | Surplus — offer discount to attract more fills |
| 50–79% | **1.0×** | Normal pricing |
| 20–49% | **1.5×** | Scarcity premium |
| 5–19% | **2.0×** | Critical scarcity premium |
| < 5% | **Rejected** | Intent declined — not enough liquidity |

---

## 🔐 Settlement & Proof Generation

### How Settlement Works

```
1. Solver sends tokens to user on TARGET chain (via ERC-20 transfer)
2. ProofGenerator generates a CrossChainProof:
   - Fetches the target chain transaction receipt
   - Waits for N confirmations
   - Signs: keccak256(intentId + txHash + amount + recipient) with solver's key
3. SettlementManager submits the proof to IntentSettlement.sol on SOURCE chain
4. Contract verifies the oracle signature and releases the locked user deposit to the solver
```

### Retry on Settlement Failure

```typescript
// Configure settlement with automatic retries
const solver = new IntentSolver({
    settlement: {
        maxClaimRetries: 3,          // retry up to 3 times
        watchIntervalMs: 30_000,     // check every 30 seconds
        onPermanentFailure: (intentId, error, attempts) => {
            // Called when all retries are exhausted
            console.error(`ALERT: ${intentId} permanently failed after ${attempts} tries`);
        }
    }
});
```

### Manual Proof Generation

```typescript
import { ProofGenerator } from "@terkoizmy/intent-sdk";

const proof = await solver.proofGenerator.generateSignatureProof({
    intentId: "0x...",
    targetTxHash: "0x...",
    targetChainId: 137,
    amount: "500000000",    // USDC amount (6 decimals)
    recipient: "0xUSER_ADDRESS",
    confirmations: 3,
});

// CrossChainProof {
//   txHash: "0x...",
//   chainId: 137,
//   blockNumber: 54321678,
//   solverSignature: "0x...",      // EIP-191 signature
//   signedData: { intentId, txHash, amount, recipient, timestamp }
// }
```

---

## 🌐 Environment Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLVER_PRIVATE_KEY` | ✅ | Hex private key (with `0x`) for the solver wallet |
| `UNICHAIN_SEPOLIA_RPC_URL` | ✅ for testnet | RPC for Unichain Sepolia chain (ID: 1301) |
| `SEPOLIA_RPC_URL` | Optional | Ethereum Sepolia RPC. Falls back to public endpoint. |
| `ARB_SEPOLIA_RPC_URL` | Optional | Arbitrum Sepolia RPC |
| `BASE_SEPOLIA_RPC_URL` | Optional | Base Sepolia RPC |
| `ETH_RPC_URL` | Optional | Ethereum Mainnet RPC (used by Aave APY reads) |
| `SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA` | For live settlement | Deployed contract proxy address |
| `SWING_API_KEY` | Optional | Swing.xyz bridge API key (public tier works without it) |

> ⚠️ **Never commit your `.env` file.** Private keys must be kept secure.

---

## 📚 Related Docs

- **[SOLVER.md](./SOLVER.md)** — Deep-dive into the solver's internal architecture and configuration
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Deploy the `IntentSettlement.sol` contract on testnet
- **[TESTNET_GUIDE.md](./TESTNET_GUIDE.md)** — Faucets, wallet funding, and testnet troubleshooting
- **[SDK_WORKFLOW.md](./SDK_WORKFLOW.md)** — End-to-end workflow diagrams
- **[ERC_STANDARDS.md](./ERC_STANDARDS.md)** — ERC-7683 and ERC-712 integration details
