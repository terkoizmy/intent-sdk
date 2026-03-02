# Intent Solver — Developer Reference

## What is the Solver?

The **IntentSolver** is a liquidity agent that listens for cross-chain bridge orders (intents) and fulfills them instantly from its own on-chain inventory. It acts as a professional "market maker" for intent-based bridging.

> **Core model:** Solver pays the user on the destination chain immediately, then claims the user's locked deposit (+ fee) on the source chain via settlement proof.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      IntentSolver                            │
│  (public API: initialize / start / stop / solve / getQuote) │
└──────────────────────────┬──────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                   ▼
  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐
  │  Mempool Layer  │  │LiquidityAgent│  │   Monitoring    │
  │  MempoolClient  │  │(Orchestrator)│  │  ProfitTracker  │
  │  IntentFilter   │  │              │  │  HealthChecker  │
  │  MempoolMonitor │  │              │  │  AlertManager   │
  └────────────────┘  └──────┬───────┘  └─────────────────┘
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
         ┌─────────────┐ ┌───────────┐ ┌─────────────────┐
         │   Inventory  │ │  Pricing  │ │   Settlement    │
         │   Manager    │ │  Engine   │ │   Manager       │
         │  (balances,  │ │(FeeCalc,  │ │  ProofGenerator │
         │   lock/unlock│ │ Dynamic,  │ │  ProofVerifier  │
         │   Rebalancer)│ │ Slippage) │ │  Smart Contract │
         └─────────────┘ └───────────┘ └─────────────────┘
```

---

## Quick Start

```typescript
import { createIntentSDK } from "intent-parser-sdk";

const sdk = createIntentSDK({
    agent: {
        privateKey: process.env.SOLVER_PRIVATE_KEY!,
        supportedChains: [1, 10, 42161],        // Ethereum, Optimism, Arbitrum
        supportedTokens: ["USDC", "USDT"],
        mode: "simulate"                          // or "live" for real execution
    },
    contractAddress: "0xYourIntentSettlementContract",
    rpcUrls: {
        1:     "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
        10:    "https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY",
        42161: "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY"
    }
});

// Initialize (loads balances, derives solver address)
await sdk.solver.initialize();

// Option A: Manual solve
const intent = buildIntentFromParsedText(...);
const result = await sdk.solver.solve(intent);

// Option B: Autonomous mode (listen to mempool)
sdk.solver.start("wss://mempool.example.com/ws");
```

---

## Configuration Reference

### `LiquidityAgentConfig`

```typescript
interface LiquidityAgentConfig {
    agent: {
        privateKey: string;        // Hex private key for solver's wallet
        name?: string;             // Human-readable solver name (default: "Solver")
        mode: "simulate" | "live"; // simulate = fake txHash; live = real ERC-20 transfer
        supportedChains: ChainId[];// Chain IDs the solver will service
        supportedTokens: string[]; // Token symbols (e.g. ["USDC", "USDT"])
    };
    contractAddress: string;       // Deployed IntentSettlement contract address
    rpcUrls?: Record<number, string>; // chainId → RPC URL map

    pricing?: {
        baseFeePercent?: number;    // Base fee as % of amount (default: 0.05%)
        gasCostBuffer?: number;     // Gas cost multiplier buffer (default: 1.2)
        minProfitUsd?: number;      // Skip intents below this profit in USD (default: 0.10)
    };

    inventory?: {
        reserveThreshold?: number;  // Min % of balance to keep in reserve (default: 0.10)
        rebalanceThreshold?: number;// Trigger rebalance if imbalance > this % (default: 0.15)
    };

    settlement?: {
        maxRetries?: number;        // Max settlement retry attempts (default: 3)
        retryDelayMs?: number;      // Delay between retries in ms (default: 30000)
        claimTimeoutMs?: number;    // Timeout for claim tx (default: 120000)
    };
}
```

---

## Fee Structure

Every intent's fee is calculated as:

```
totalFee = baseFee + gasCost + slippageCapture
```

| Component | Description | Formula |
|-----------|-------------|---------|
| `baseFee` | Solver's service charge | `amount × baseFeePercent` |
| `gasCost` | Estimated gas on target chain | `gasEstimate × gasPrice × buffer` |
| `slippageCapture` | Profit from user's slippage tolerance | `amount × (maxSlippage - actualSlippage)` |

### Dynamic Inventory Multiplier

When inventory on the target chain is low, fees are multiplied to discourage depleting reserves:

```
inventoryRatio = available / total
multiplier = max(1.0, (reserveThreshold / inventoryRatio) ^ 2)
```

If `inventoryRatio` drops below `reserveThreshold * 0.5`, the intent is rejected entirely.

---

## Solve Lifecycle

```
canSolve(intent)
  └─ intentType = "bridge"? ✓
  └─ sourceChain in supportedChains? ✓
  └─ targetChain in supportedChains? ✓
  └─ token in supportedTokens? ✓
  └─ deadline > now? ✓
  └─ canFulfill(targetChain, token, amount)? ✓

getQuote(intent) → PricingResult { baseFee, gasCost, slippageCapture, totalFee,
                                    userPays, userReceives, solverProfit }

solve(intent)
  1. Validate (canSolve: expired, unsupported, insufficient)
  2. Price (dynamicPricing.getPrice)
  3. Profitability check (dynamicPricing.shouldReject)
  4. Lock inventory on target chain
  5. Send funds to user on target chain [simulate: fake txHash, live: ERC-20 transfer]
  6. Confirm inventory deduction
  7. Generate + submit settlement proof
  → SolutionResult { success, txHash, profit, output, metadata }
```

> **Note:** Settlement failure (step 7) is **non-fatal**. If the settlement contract is temporarily unreachable, the solve result is still `success: true` and settlement will be retried automatically by the watcher loop.

---

## API Reference

### `IntentSolver`

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize()` | `async (): Promise<void>` | Load balances and derive solver address. Call before anything else. |
| `start(url)` | `(mempoolUrl: string): void` | Connect to mempool WebSocket and begin autonomous listening. |
| `stop()` | `(): void` | Disconnect WebSocket and stop all background processes. |
| `canSolve(intent)` | `(intent: SolverIntent): boolean` | Check if the solver can service this intent. |
| `getQuote(intent)` | `(intent: SolverIntent): PricingResult` | Get a price quote without executing. |
| `solve(intent)` | `async (intent: SolverIntent): Promise<SolutionResult>` | Execute full solve cycle. |
| `getStatus()` | `(): AgentStatus` | Returns `"idle"` or `"processing"`. |
| `getStats()` | `(): { profitStats, mempoolStats }` | Returns operational and financial stats. |

### `SolverIntent` (input)

```typescript
interface SolverIntent {
    intentId: string;        // Unique ID (on-chain or UUID)
    intentHash: Hash;        // Keccak256 of intent data
    user: Address;           // User's wallet address
    signature: string;       // User's EIP-191 signature over intentHash
    deadline: number;        // Unix timestamp — intent expires after this
    status: IntentStatus;    // "pending" for new intents
    receivedAt: number;      // Unix timestamp when solver received it
    parsedIntent: StructuredIntent; // Output from IntentParser
}
```

### `SolutionResult` (output)

```typescript
interface SolutionResult {
    success: boolean;        // Whether the solve completed
    txHash?: Hash;           // Target chain transaction hash
    profit?: string;         // Solver profit in token's smallest unit
    output?: string;         // Amount user received
    error?: string;          // Error message if success = false
    metadata?: {
        solveDurationMs: number;
        sourceChainId: ChainId;
        targetChainId: ChainId;
        feeBreakdown?: { baseFee, gasCost, slippageCapture, totalFee }
    }
}
```

---

## Monitoring

### ProfitTracker Stats
Access via `solver.getStats().profitStats`:

```typescript
{
    totalAttempts: number;   // Total intents attempted
    totalSuccesses: number;  // Successful solves
    totalFailures: number;   // Failed solves
    totalProfit: string;     // Cumulative profit in smallest token unit
    averageProfit: string;   // Average profit per solve
    roi: string;             // Return on inventory as %
}
```

### Mempool Stats
Access via `solver.getStats().mempoolStats`:

```typescript
{
    received: number;   // Intents received from mempool
    filtered: number;   // Intents skipped by IntentFilter
    solved: number;     // Successfully solved
    failed: number;     // Failed to solve
}
```

---

## Deployment Modes

| Mode | `sendOnTargetChain` behavior | Use Case |
|------|------------------------------|----------|
| `"simulate"` | Generates a deterministic fake txHash | Development, testing |
| `"live"` | Executes a real ERC-20 `transfer()` via WalletManager | Production |

> ⚠️ **Live mode** requires:
> - The solver's wallet to hold sufficient token balance on the target chain
> - Valid RPC URLs configured for all supported chains
> - A deployed `IntentSettlement` contract on all supported chains

---

## Background Rebalancing

The `Rebalancer` checks and maintains token distribution across chains:

```typescript
import { Rebalancer } from "intent-parser-sdk/solver";

const rebalancer = new Rebalancer(
    inventoryManager,
    swingProtocol,  // or any IBridgeProtocol implementation
    {
        targetPercentage: 0.33,    // Want 33% on each chain
        thresholdPercentage: 0.10, // Rebalance if imbalance > 10%
        minRebalanceAmount: 100n,  // Don't bridge tiny amounts
    },
    solverAddress
);

// Automatic rebalancing
await rebalancer.autoRebalance("USDC");
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/solver/index.ts` | `IntentSolver` public wrapper |
| `src/solver/agent/liquidity-agent.ts` | Core orchestrator |
| `src/solver/agent/agent-config.ts` | Config schema + defaults |
| `docs/SDK_WORKFLOW.md` | Full workflow diagram |
| `examples/basic-bridge.ts` | Manual solve example |
| `examples/autonomous-agent.ts` | Autonomous mode example |
| `examples/inventory-management.ts` | Inventory & rebalancing example |
