# Intent Parser SDK

Lightweight natural language parser and autonomous solver SDK for blockchain intents.

## Installation

```bash
npm install @terkoizmy/intent-sdk
# or
bun add @terkoizmy/intent-sdk
```

## Quick Start

> **For the full, comprehensive guide, please see [docs/USAGE.md](./docs/USAGE.md).**

### Parser Only

```typescript
import { IntentParser } from "@terkoizmy/intent-sdk";

const parser = new IntentParser();
const result = await parser.parse("Bridge 100 USDC from Ethereum to Arbitrum");

// { success: true, data: { intentType: 'bridge', parameters: { ... } } }
```

### SDK Factory (Parser + Solver)

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { parser, solver } = createIntentSDK({
    solver: {
        privateKey: process.env.SOLVER_PRIVATE_KEY!,
        supportedChains: [1, 10, 42161],
        supportedTokens: ["USDC", "USDT"],
        mode: "simulate"   // use "live" for real execution
    },
    }
});

await solver.initialize();

if (solver.canSolve(intent)) {
    const result = await solver.solve(intent);
    console.log(result); // { success: true, txHash: "0x...", profit: "..." }
}
```

### Autonomous Mode

Connect to a mempool server and solve intents automatically in the background:

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";

const { solver } = createIntentSDK({
    solver: {
        privateKey: process.env.SOLVER_PRIVATE_KEY!,
        supportedChains: [1, 10, 42161],
        supportedTokens: ["USDC"],
        mode: "live"
    },
    }
});

await solver.initialize();
solver.start("wss://mempool.yourprotocol.com/ws");

setInterval(() => {
    const stats = solver.getStats();
    console.log("Solved:", stats.mempoolStats.solved);
}, 5000);
```

## Supported Intent Types

| Type | Example |
|------|---------|
| **bridge** | "Bridge 100 USDC from Ethereum to Arbitrum" |
| **send** | "Send 50 USDT to 0xAbc..." |
| **swap** | "Swap 1 ETH for USDC on Uniswap" |
| **claim** | "Claim rewards from staking" |
| **yield_strategy** | "Deposit 1000 USDC into yield strategy with low risk" |

## Supported Chains

### Mainnets

| Chain | ID |
|-------|----|
| Ethereum Mainnet | 1 |
| Optimism | 10 |
| Arbitrum One | 42161 |

### Testnets

| Chain | ID | Settlement Contract |
|-------|----|--------------------|
| Unichain Sepolia | 1301 | [`0x7066f6...`](https://unichain-sepolia.blockscout.com/address/0x7066f6dFc1C652c165Bc9BB10085fD95719b5eA6) |
| Ethereum Sepolia | 11155111 | — |
| Arbitrum Sepolia | 421614 | — |
| Base Sepolia | 84532 | — |

Configure additional chains by adding their IDs to `supportedChains` and providing RPC URLs.

## Environment Configuration

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLVER_PRIVATE_KEY` | ✅ | Solver wallet private key (hex, with `0x`) |
| `UNICHAIN_SEPOLIA_RPC_URL` | ✅ | RPC for Unichain Sepolia (1301) |
| `SEPOLIA_RPC_URL` | Optional | RPC for Ethereum Sepolia |
| `ARB_SEPOLIA_RPC_URL` | Optional | RPC for Arbitrum Sepolia |
| `ETH_RPC_URL` | Optional | Ethereum Mainnet RPC (Aave reads) |
| `SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA` | For live settlement | Deployed proxy address |

See [.env.example](./.env.example) for the full list.

## Solver Economics

The solver earns a fee on every successful solve:

```
totalFee = baseFee + gasCost + slippageCapture
```

- **baseFee** — fixed % of the bridge amount (configurable, default 0.05%)
- **gasCost** — estimated gas cost on the destination chain
- **slippageCapture** — profit from unused slippage tolerance

The solver receives `userPays = inputAmount` from the source chain settlement and pays the user `userReceives = inputAmount - totalFee` on the target chain. The difference is solver profit.

## API

### `IntentParser`

```typescript
new IntentParser(config?: ParserConfig)
```

| Method | Returns | Description |
|--------|---------|-------------|
| `parse(text)` | `Promise<ParseResult>` | Parse a natural language intent |
| `parseBatch(texts)` | `Promise<ParseResult[]>` | Parse multiple intents |

### `IntentSolver`

```typescript
new IntentSolver(config: LiquidityAgentConfig)
```

| Method | Description |
|--------|-------------|
| `initialize()` | Load balances and derive solver address |
| `start(url)` | Connect to mempool WebSocket |
| `stop()` | Disconnect and stop all background work |
| `canSolve(intent)` | Check if this intent can be solved |
| `getQuote(intent)` | Get fee breakdown without executing |
| `solve(intent)` | Execute full solve → settlement flow |
| `getStatus()` | Returns `"idle"` or `"processing"` |
| `getStats()` | Returns profit + mempool statistics |

### `createIntentSDK(config)`

Factory that creates both `parser` and `solver` in one call:

```typescript
const { parser, solver } = createIntentSDK(config);
```

## Documentation

| Document | Contents |
|----------|----------|
| [docs/USAGE.md](./docs/USAGE.md) | Comprehensive How-To Guide for using the SDK |
| [docs/SOLVER.md](./docs/SOLVER.md) | Architecture, config reference, fee structure, API details |
| [docs/SDK_WORKFLOW.md](./docs/SDK_WORKFLOW.md) | End-to-end workflow diagrams |
| [docs/ERC_STANDARDS.md](./docs/ERC_STANDARDS.md) | ERC-7683, ERC-712 standards used |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Step-by-step testnet deployment guide |
| [docs/TESTNET_GUIDE.md](./docs/TESTNET_GUIDE.md) | Faucets, funding, troubleshooting |

## Examples

| File | Description |
|------|-------------|
| `examples/basic-bridge.ts` | Parse + manual solve |
| `examples/autonomous-agent.ts` | Autonomous mempool listener |
| `examples/inventory-management.ts` | Inventory snapshot + rebalancing |

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test all (parser + solver units + integration)
bun test

# Run specific test suites
bun test tests/parser/
bun test tests/solver/
bun test tests/integration/
bun test tests/shared/

# Live tests (requires funded wallet + RPC)
bun test tests/live/

# E2E testnet tests (full pipeline)
bun test tests/e2e/

# Run an example
npx tsx examples/basic-bridge.ts
```

## Project Structure

```
src/
├── parser/          ← IntentParser (Stage 1)
├── solver/          ← IntentSolver / LiquidityAgent (Stage 2+3)
│   ├── agent/       ← LiquidityAgent, AgentConfig
│   ├── contracts/   ← IntentSettlement viem wrapper
│   ├── inventory/   ← InventoryManager, Rebalancer
│   ├── pricing/     ← DynamicPricing, FeeCalculator
│   ├── settlement/  ← ProofGenerator, SettlementManager
│   ├── mempool/     ← MempoolClient, IntentFilter
│   ├── monitoring/  ← ProfitTracker, HealthChecker
│   └── protocols/   ← LiFi (aggregator), Aave (lending)
├── shared/          ← WalletManager, ChainRegistry, RPC, TokenRegistry
│   ├── rpc/         ← RPCProviderManager, ViemProvider (with retry)
│   ├── utils/       ← ERC-20 utils, retry with backoff
│   └── chain-registry/ ← Chain configs, chain names
├── errors/          ← Domain-specific error classes
└── types/           ← Shared types
contracts/           ← IntentSettlement.sol (ERC-7683, UUPS)
tests/
├── parser/          ← Parser unit tests
├── solver/          ← Solver unit tests
├── shared/          ← Shared util tests (retry, viem, enrichment)
├── integration/     ← Mock-based integration tests
├── live/            ← Live testnet tests (guarded)
└── e2e/             ← Full E2E pipeline tests (guarded)
docs/                ← Documentation
examples/            ← Runnable usage examples
```

## License

MIT
