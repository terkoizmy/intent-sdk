# Quick Start & Usage Guide

**Intent Parser SDK** (`@terkoizmy/intent-sdk`) allows developers to parse natural language inputs into structured blockchain transaction intents and solve them across networks.

---

## 📦 Installation

```bash
# Using npm
npm install @terkoizmy/intent-sdk

# Using bun
bun add @terkoizmy/intent-sdk

# Using yarn
yarn add @terkoizmy/intent-sdk
# Using pnpm
pnpm add @terkoizmy/intent-sdk
```

---

## 🚀 Quick Start (Parser + Solver)

The easiest way to use both the Parser and the Solver is via the `createIntentSDK` factory.

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

async function main() {
    // 1. Initialize SDK
    const { parser, solver } = createIntentSDK({
        solver: {
            agent: {
                privateKey: "0xYOUR_PRIVATE_KEY", // Needed to solve intents
                mode: "simulate", // Use "live" for actual transactions on testnet/mainnet
                supportedChains: [1, 10, 42161], // Ethereum, Optimism, Arbitrum
                supportedTokens: ["USDC"]
            },
            // Contract address on the settlement chain
            contractAddress: "0xYOUR_SETTLEMENT_CONTRACT_ADDRESS" 
        }
    });

    // 2. Initialize asynchronous solver state (balances, etc.)
    await solver.initialize();

    // 3. Parse Natural Language
    const text = "Bridge 100 USDC to Arbitrum";
    const result = parser.parse(text);
    
    if (!result.success) {
        throw new Error(`Parse failed: ${result.error}`);
    }

    console.log("Parsed Intent:", result.data);

    // Create a solver intent
    const intent = {
        intentId: crypto.randomUUID(),
        creator: "0xUSER_ADDRESS",
        parsedIntent: result.data,
        deadline: Math.floor(Date.now() / 1000) + 3600
    };

    // 4. Check if solvable and get quote
    if (solver.canSolve(intent)) {
        const quote = solver.getQuote(intent);
        console.log("Pricing Quote:", quote);

        // 5. Solve the intent executing the required steps
        const solveResult = await solver.solve(intent);
        console.log("Solve Successful:", solveResult);
    }
}

main().catch(console.error);
```

---

## 🧠 1. Using the Parser Only

If you only need NLP to parse intents without the solver engine executing them, use `IntentParser` directly.

```typescript
import { IntentParser } from "@terkoizmy/intent-sdk";

// Initialize with optional configuration
const parser = new IntentParser({
    defaultDeadlineOffset: 3600, // 1 hour default
    minConfidence: 0.5,
    knownTokens: {
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    }
});

// Synchronous parsing (fast, uses knownTokens or extracts symbols)
const result = parser.parse("Swap 100 USDC to ETH with max 1% slippage");

if (result.success && result.data) {
    console.log(result.data.intentType); // "swap"
    console.log(result.data.parameters); // { inputToken: "USDC", outputToken: "ETH", inputAmount: "100" }
    console.log(result.data.constraints); // { maxSlippage: 100 } (basis points)
}
```

### Supported Intent Types

The parser currently understands the following intents:
1. **Swap**: `"Swap 100 USDC to ETH"`
2. **Bridge**: `"Bridge 500 USDC from Ethereum to Arbitrum"`
3. **Send / Transfer**: `"Send 50 USDC to vitalik.eth"`
4. **Yield / Stake**: `"Stake 10 ETH in Lido for highest APY"`
5. **Airdrop / Claim**: `"Claim my ARB airdrop"`
6. **NFT Purchase**: `"Buy a BAYC NFT for max 10 ETH"`

### Batch Parsing

Parse multiple texts synchronously:
```typescript
const results = parser.parseBatch([
    "Swap 100 USDC to ETH",
    "Stake 5 ETH",
    "Send 0.1 ETH to alice.eth"
]);
```

---

## ⚙️ 2. Using the Solver

The solver takes parsed intents, checks inventory, quotes fees, and executes logic across chains.

```typescript
import { IntentSolver } from "@terkoizmy/intent-sdk";

const solver = new IntentSolver({
    agent: {
        privateKey: process.env.SOLVER_PRIVATE_KEY!,
        mode: "live", // actually executes logic
        supportedChains: [1, 42161],
        supportedTokens: ["USDC"],
    },
    contractAddress: process.env.SETTLEMENT_CONTRACT!
});

// Always initialize asynchronously before taking orders
await solver.initialize();
```

### Solver Modes
- `"simulate"`: Mocks operations. Prices are calculated but transactions are not signed or sent. Good for testing parser logic locally.
- `"live"`: Uses Viem and executes real transactions against provided RPC endpoints.

### Retry Logic (Transient Network Errors)

The SDK utilizes exponential backoff for transient RPC errors (like rate limits, 502/504 errors, timeouts). All live provider calls in `ViemProvider` are automatically wrapped with the SDK's internal `withRetry` utility for robust testnet and production performance.

---

## 🛠️ Environment Configuration

For **live mode** execution across testnets or mainnets, configure your RPC URLs in your environment:

```env
# Required for Solver execution
SOLVER_PRIVATE_KEY=your_private_key_here

# Required RPC URLs (if resolving chains like Sepolia, Arbitrum Sepolia, etc)
ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://sepolia.base.org
OPTIMISM_RPC_URL=https://sepolia.optimism.io
UNICHAIN_RPC_URL=https://sepolia.unichain.org
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology

# Swing.xyz token API fallback (optional)
# SWING_API_KEY=your_swing_key
```

---

## 🧰 Error Handling

The SDK exposes specific Error classes for catching exact solver/settlement failure modes. 

```typescript
import { 
    SolverError, 
    InsufficientInventoryError, 
    IntentExpiredError,
    SettlementError
} from "@terkoizmy/intent-sdk";

try {
    const result = await solver.solve(intent);
} catch (error) {
    if (error instanceof InsufficientInventoryError) {
        console.error(`Not enough inventory on ${error.chainName} to solve.`);
    } else if (error instanceof IntentExpiredError) {
        console.error("Intent deadline passed!");
    } else if (error instanceof SettlementError) {
        console.error("Settlement on origin chain failed to verify proof.");
    } else {
        console.error("General Failure:", error);
    }
}
```

For full deployment patterns and details on setting up the Settlement Smart Contract, see the [DEPLOYMENT](./DEPLOYMENT.md) and [TESTNET](./TESTNET_GUIDE.md) manuals.
