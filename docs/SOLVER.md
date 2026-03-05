# Intent Solver — Developer Reference

> Deep-dive reference for the **IntentSolver** subsystem: architecture, configuration, fee structure, monitoring, and internal APIs.

---

## What Is the Solver?

The **IntentSolver** is an autonomous on-chain liquidity agent. It watches for cross-chain bridge intents, fulfills them instantly from pre-positioned inventory, and recovers its capital via ERC-7683 settlement proofs.

> **Core model:** Solver pays the user on the **destination chain** immediately. Then claims the user's locked deposit (+ fee) on the **source chain** via a cryptographic settlement proof.

This is a **just-in-time liquidity** model — the solver takes on the cross-chain timing risk and earns a fee for doing so.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                           IntentSolver                                 │
│          (public API: initialize / start / stop / solve / canSolve)    │
└────────────────────────────────┬──────────────────────────────────────┘
                                  │
          ┌───────────────────────┼──────────────────────┐
          ▼                       ▼                       ▼
  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
  │   Mempool Layer  │   │  LiquidityAgent  │   │     Monitoring       │
  │ ─────────────── │   │  ─────────────── │   │─────────────────────│
  │ MempoolClient    │   │   (Orchestrator) │   │ ProfitTracker        │
  │ IntentFilter     │   │                  │   │ HealthChecker        │
  │ MempoolMonitor   │   │                  │   │ AlertManager         │
  │ SolutionSubmitter│   │                  │   │                      │
  └─────────────────┘   └────────┬─────────┘   └──────────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                   ▼
      ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
      │   Inventory   │  │  Pricing Engine  │  │  Settlement Manager  │
      │ ──────────── │  │ ──────────────── │  │ ──────────────────── │
      │ InventoryMgr  │  │ FeeCalculator    │  │ ProofGenerator       │
      │ Rebalancer    │  │ DynamicPricing   │  │ ProofVerifier        │
      │ (Li.Fi/Swing) │  │ SlippageCapture  │  │ SettlementManager    │
      └──────────────┘  └──────────────────┘  └──────────────────────┘
                                                         │
                                               ┌─────────▼──────────────┐
                                               │ Smart Contract Layer    │
                                               │ ──────────────────────  │
                                               │ ViemSettlementContract  │
                                               │ IntentSettlement.sol    │
                                               │ (ERC-7683 + UUPS)       │
                                               └────────────────────────┘
```

---

## Quick Start

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { solver } = createIntentSDK({
    solver: {
        agent: {
            privateKey: process.env.SOLVER_PRIVATE_KEY!,
            mode: "simulate",                      // or "live"
            supportedChains: [1, 10, 42161, 137],
            supportedTokens: ["USDC", "USDT"],
            maxConcurrentIntents: 5,
        },
        contractAddress: "0xYourIntentSettlementContract",
        rpcUrls: {
            1:     process.env.ETH_RPC_URL!,
            10:    process.env.OP_RPC_URL!,
            42161: process.env.ARB_RPC_URL!,
            137:   process.env.POLYGON_RPC_URL!,
        },
    },
});

await solver.initialize();                          // Load balances, derive address
const result = await solver.solve(intent);          // Manual solve
// or
solver.start("wss://mempool.example.com/ws");       // Autonomous mode
```

---

## Configuration Reference

### `LiquidityAgentConfig`

```typescript
interface LiquidityAgentConfig {
    agent: {
        privateKey: string;            // Hex private key (with 0x) for the solver wallet
        name?: string;                 // Human label (default: "Solver")
        mode: "simulate" | "live";    // simulate = fake txHash, live = real ERC-20 transfer
        supportedChains: ChainId[];    // Chain IDs to service
        supportedTokens: string[];     // Token symbols, e.g. ["USDC", "USDT"]
        maxConcurrentIntents?: number; // Parallel solve limit (default: 5)
    };

    contractAddress: string;           // Deployed IntentSettlement.sol proxy address
    rpcUrls?: Record<number, string>;  // chainId → RPC URL (falls back to public RPCs if omitted)

    pricing?: PricingConfig;
    inventory?: InventoryConfig;
    settlement?: SettlementConfig;
}
```

### `PricingConfig`

```typescript
interface PricingConfig {
    baseFeePercent?: number;       // Base fee as % of amount (default: 0.005 = 0.5%)
    minFeeUSD?: number;            // Minimum fee in USD (default: 1)
    maxFeePercent?: number;        // Maximum fee cap (default: 0.03 = 3%)
    slippageSharePercent?: number; // Share of user's slippage to capture (default: 0.5 = 50%)
    gasEstimateBuffer?: number;    // Gas estimate multiplier for safety (default: 1.2)
}
```

### `InventoryConfig`

```typescript
interface InventoryConfig {
    minReservePercent?: number;    // Min reserve per chain as fraction (default: 0.10 = 10%)
    rebalanceThreshold?: number;   // Trigger rebalance when imbalance > this (default: 0.15 = 15%)
    targetAllocation?: Record<ChainId, number>; // Optional: desired % allocation per chain
}
```

### `SettlementConfig`

```typescript
interface SettlementConfig {
    requiredConfirmations?: number;                              // Block confirmations before proof (default: 3)
    maxClaimRetries?: number;                                    // Max claim attempts (default: 3)
    watchIntervalMs?: number;                                    // Retry watcher interval in ms (default: 30_000)
    oracleAddress?: string;                                      // Oracle address for proof verification
    onPermanentFailure?: (                                       // Callback when max retries exhausted
        intentId: string,
        error: string,
        attempts: number
    ) => void;
}
```

---

## Fee Structure

Every intent's fee is calculated as:

```
totalFee = baseFee + gasCost + slippageCapture

userPays    = inputAmount         (locked by user on source chain)
userReceives = inputAmount - totalFee  (sent to user on target chain)
solverProfit = totalFee - gasCost
```

| Component | Default | Description |
|-----------|---------|-------------|
| `baseFee` | 0.5% | Service charge on bridge amount |
| `gasCost` | Dynamic | Estimated gas on target chain (mainnet: ~$3, L2: ~$0.50) |
| `slippageCapture` | 50% of user's tolerance | Profit from the user's declared slippage buffer |

### Dynamic Inventory Multiplier

When inventory on the target chain is low, the `baseFee` is multiplied to compensate for rebalancing cost:

| Target Chain Capacity | Multiplier | Effect |
|----------------------|-----------|--------|
| ≥ 80% | **0.8×** | Discount — surplus inventory, price aggressively |
| 50–79% | **1.0×** | Normal fees |
| 20–49% | **1.5×** | Scarcity premium |
| 5–19% | **2.0×** | High scarcity premium |
| < 5% | **Rejected** | Intent declined — too risky |

> Capacity ratio = `available[chainId]` / `total across all chains`

---

## Solve Lifecycle

```
solve(intent)
  ├─ 1. Validate
  │     ├─ intentType === "bridge"?
  │     ├─ Not expired (deadline > now)?
  │     ├─ B14: maxConcurrentIntents not exceeded?
  │     └─ B9: deadline re-checked (race condition guard)
  │
  ├─ 2. Price
  │     └─ DynamicPricing.getPrice(intent) → PricingResult
  │
  ├─ 3. Reject Check
  │     └─ DynamicPricing.shouldReject(targetChain, amount)?
  │
  ├─ 4. Lock Inventory
  │     └─ InventoryManager.lock(targetChain, token, amount)
  │
  ├─ 5. Execute Transfer
  │     ├─ mode = "simulate": return fake txHash (deterministic)
  │     └─ mode = "live": WalletManager.sendERC20(targetChain, user, token, amount)
  │
  ├─ 6. Update Inventory
  │     └─ InventoryManager.deduct(targetChain, token, amount)
  │
  ├─ 7. Generate & Submit Settlement Proof
  │     ├─ ProofGenerator.generateSignatureProof(...)
  │     ├─ ProofVerifier.verifySignatureProof(proof, oracle, solver)
  │     └─ Contract.claim(order, solverSignature)
  │
  └─ → SolutionResult { success, txHash, profit, output, metadata }
```

> **Settlement failure is non-fatal.** If the settlement contract is temporarily unreachable, `solve()` still returns `success: true` and the `SettlementManager` watcher retries the claim automatically every `watchIntervalMs` until `maxClaimRetries` is exhausted. If all retries fail, `onPermanentFailure` is called.

---

## API Reference

### `IntentSolver` (Public Methods)

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize()` | `async (): Promise<void>` | Load balances, derive solver address. **Must be called first.** |
| `start(url)` | `(mempoolUrl: string): void` | Connect to WebSocket mempool and begin automatic solving |
| `stop()` | `(): void` | Disconnect and stop all background work |
| `canSolve(intent)` | `(intent: SolverIntent): boolean` | Returns `true` if this intent is serviceable |
| `getQuote(intent)` | `(intent: SolverIntent): PricingResult` | Get full fee breakdown without executing |
| `solve(intent)` | `async (intent: SolverIntent): Promise<SolutionResult>` | Execute full solve cycle |
| `getStatus()` | `(): AgentStatus` | `"idle"` or `"processing"` |
| `getStats()` | `(): { profitStats, mempoolStats }` | Operational and financial statistics |

### `SolverIntent` (Input Shape)

```typescript
interface SolverIntent {
    intentId: string;              // Unique ID (UUID or on-chain bytes32)
    intentHash: Hash;              // Keccak256 of intent contents (for settlement)
    user: Address;                 // User's wallet address
    signature: string;             // User's EIP-191 signature over intentHash
    deadline: number;              // Unix timestamp — intent expires at this time
    status: "pending" | "fulfilling" | "completed" | "failed";
    receivedAt: number;            // Unix ms timestamp when solver received it
    solver?: Address;              // Solver's address (set by initialize())
    parsedIntent: StructuredIntent; // Output from IntentParser.parse()
}
```

### `SolutionResult` (Output Shape)

```typescript
interface SolutionResult {
    success: boolean;
    txHash?: Hash;                 // Target chain transaction hash
    profit?: string;               // Solver profit in token's smallest unit
    output?: string;               // Amount user received (in token's smallest unit)
    error?: string;                // Error message if success = false
    metadata?: {
        solveDurationMs: number;
        sourceChainId: ChainId;
        targetChainId: ChainId;
        feeBreakdown?: {
            baseFee: string;
            gasCost: string;
            slippageCapture: string;
            totalFee: string;
        };
    };
}
```

### `PricingResult` (Quote Output)

```typescript
interface PricingResult {
    baseFee: bigint;
    gasCost: bigint;
    slippageCapture: bigint;
    totalFee: bigint;
    userPays: bigint;
    userReceives: bigint;
    solverProfit: bigint;
    inventoryMultiplier: number;   // 0.8 / 1.0 / 1.5 / 2.0
}
```

---

## Monitoring

### ProfitTracker

Access via `solver.getStats().profitStats`:

```typescript
{
    totalAttempts: number;   // Total intents attempted
    successCount: number;    // Successful solves
    failCount: number;       // Failed solves
    totalProfit: string;     // Cumulative profit in token smallest unit
    totalGasCost: string;    // Cumulative gas cost
    avgProfit: string;       // Average profit per successful solve
}
```

### Mempool Stats

Access via `solver.getStats().mempoolStats`:

```typescript
{
    received: number;   // Intents received from mempool WebSocket
    filtered: number;   // Intents skipped by IntentFilter (duplicates, unsupported)
    solved: number;     // Successfully solved
    failed: number;     // Failed to solve
}
```

### HealthChecker

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

### AlertManager

```typescript
// All CRITICAL alerts (e.g. for dashboard or Slack integration)
const alerts = solver.alertManager.getAlerts("CRITICAL");

for (const alert of alerts) {
    console.log(`[${alert.level}] ${alert.message}`, alert.data);
}

// Clear all alerts after processing
solver.alertManager.clearAlerts();
```

---

## IntentFilter (Dedup & Mempool Guard)

The `IntentFilter` prevents duplicate processing:

- Maintains a `Set<string>` of seen intent IDs
- Configurable `maxCacheSize` (default: 10,000) — old entries are pruned when full (FIFO)
- Applied automatically in autonomous mode

```typescript
import { IntentFilter } from "@terkoizmy/intent-sdk";

const filter = new IntentFilter({ maxCacheSize: 5000 });

filter.shouldProcess(intent);  // true if new, false if seen
```

---

## Protocol Integrations

### Li.Fi (Bridge Aggregator)

Used for inventory rebalancing across chains. Returns the best available bridge route automatically:

```typescript
import { LiFiProtocol } from "@terkoizmy/intent-sdk";

const lifi = new LiFiProtocol();

// Get a quote for moving USDC from ETH → Polygon
const quote = await lifi.quote({
    fromChain: 1,
    toChain: 137,
    token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    amount: 1000_000_000n,   // 1000 USDC
    fromAddress: "0xSolverAddress",
});

// Build the actual transaction calldata
const txs = await lifi.buildTransaction(quote, params);
```

### Swing.xyz (Bridge Aggregator)

Alternative bridge protocol with DEX aggregation:

```typescript
import { SwingProtocol } from "@terkoizmy/intent-sdk";

const swing = new SwingProtocol(process.env.SWING_API_KEY || "");

// Fetch supported tokens on a chain
const tokens = await swing.getTokens(137); // Polygon tokens

// Get a bridge quote
const quote = await swing.quote({ fromChain: 1, toChain: 137, token: "USDC", amount: 500n });

// Check transfer status
const status = await swing.getTransferStatus(transferId);
// "pending" | "done" | "failed"
```

### Aave (Lending Protocol)

Deposit idle inventory to earn APY while it sits unused:

```typescript
import { AaveProtocol } from "@terkoizmy/intent-sdk";

const aave = new AaveProtocol(rpcProviderManager, poolAddresses, dataProviderAddresses);

// Get current APY for USDC on Ethereum
const apy = await aave.getAPY("0xUSDC_ADDRESS", 1);
console.log(`Aave USDC APY: ${apy.toFixed(2)}%`);

// Build supply transactions (returns [approve, supply])
const txs = await aave.buildTransaction(quote, params);

// Build withdraw transaction
const withdrawTx = await aave.buildWithdraw(usdcAddress, amount, chainId, recipientAddress);
```

---

## Deployment Modes

| Mode | `solve()` Behavior | Transactions Sent | Use Case |
|------|-------------------|-------------------|----------|
| `"simulate"` | Returns deterministic fake `txHash` | ❌ None | Dev, testing, CI/CD |
| `"live"` | Signs + broadcasts real ERC-20 `transfer()` | ✅ On-chain | Staging, production |

> **Live mode requirements:**
> - Solver wallet holds sufficient token balance on every target chain
> - Valid RPC URLs configured for all supported chains
> - `IntentSettlement.sol` deployed on all supported chains

---

## Related Resources

| File | Purpose |
|------|---------|
| `src/solver/index.ts` | `IntentSolver` public-facing wrapper |
| `src/solver/agent/liquidity-agent.ts` | Core orchestrator |
| `src/solver/agent/agent-config.ts` | Config schema and defaults |
| `src/solver/pricing/dynamic-pricing.ts` | Inventory-aware dynamic pricing |
| `src/solver/settlement/settlement-manager.ts` | Settlement lifecycle + retry logic |
| `src/solver/protocols/aggregators/lifi.ts` | Li.Fi rebalancing integration |
| `src/solver/protocols/aggregators/swing.ts` | Swing.xyz rebalancing integration |
| `src/solver/protocols/lending/aave.ts` | Aave yield integration |
| `docs/USAGE.md` | Full how-to usage guide |
| `docs/DEPLOYMENT.md` | Smart contract deployment guide |
| `examples/autonomous-agent.ts` | Full autonomous agent example |
