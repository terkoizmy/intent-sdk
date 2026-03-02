# Testnet Guide

How to fund wallets, obtain testnet tokens, and run the Intent Parser SDK's live and E2E tests.

## Supported Testnets

| Chain | ID | Native Token | Explorer |
|-------|----|-------------|----------|
| Unichain Sepolia | 1301 | ETH | [blockscout](https://unichain-sepolia.blockscout.com/) |
| Ethereum Sepolia | 11155111 | ETH | [etherscan](https://sepolia.etherscan.io/) |
| Arbitrum Sepolia | 421614 | ETH | [arbiscan](https://sepolia.arbiscan.io/) |
| Base Sepolia | 84532 | ETH | [basescan](https://sepolia.basescan.org/) |

## Faucets

### Sepolia ETH

| Faucet | Link | Notes |
|--------|------|-------|
| Google Cloud | [cloud.google.com/faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) | Requires Google account |
| Alchemy | [sepoliafaucet.com](https://sepoliafaucet.com) | Requires Alchemy account |
| Infura | [infura.io/faucet](https://www.infura.io/faucet/sepolia) | Requires Infura account |

### Unichain Sepolia ETH

1. Get Sepolia ETH from any faucet above
2. Bridge to Unichain Sepolia via [Superbridge](https://superbridge.app/unichain-sepolia)

### Testnet USDC

- **Sepolia USDC** (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`): Mint from [Circle Faucet](https://faucet.circle.com/)
- **Unichain Sepolia USDC**: Bridge Sepolia USDC via Superbridge, or use the contract's test mint if available

## Wallet Funding Checklist

Before running live tests, ensure your solver wallet has:

- [ ] ≥ 0.05 ETH on Unichain Sepolia (for gas)
- [ ] ≥ 10 USDC on Unichain Sepolia (for transfer tests)
- [ ] ≥ 0.01 ETH on Ethereum Sepolia (if running settlement tests there)

## Running Tests

### Unit & Integration (No Wallet Needed)

```bash
bun test tests/parser/ tests/solver/ tests/integration/ tests/shared/
```

### Live Tests (Funded Wallet Required)

```bash
# All live tests
bun test tests/live/

# Specific test suites
bun test tests/live/erc20-transfer.test.ts      # Real USDC transfer
bun test tests/live/settlement-onchain.test.ts   # On-chain claim()
bun test tests/live/aave-onchain.test.ts         # Aave APY read
bun test tests/live/lifi-api.test.ts             # Li.Fi quote API
```

### End-to-End (Full Pipeline)

```bash
bun test tests/e2e/testnet-bridge.test.ts     # Parse → Enrich → Solve → Transfer → Settle
bun test tests/e2e/testnet-health.test.ts     # RPC health checks
```

> [!NOTE]
> Live and E2E tests are **guarded** — they automatically skip if required env vars (`SOLVER_PRIVATE_KEY`, RPC URLs) are not set.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `insufficient funds for gas` | Wallet has no ETH on the target chain | Fund via faucet (see above) |
| `nonce too low` | Pending tx or stale nonce cache | Wait for pending txs to confirm, or restart |
| `Invalid oracle signature` | Digest mismatch between SDK and contract | Ensure `ProofGenerator` uses `abi.encodePacked(intentId, "FILLED", solverAddress)` |
| `execution reverted` | Contract precondition not met | Check: is the intent already claimed? Is USDC approved? |
| `ECONNREFUSED` / `fetch failed` | RPC endpoint unreachable | Verify RPC URL in `.env`, try alternate endpoint |
| `Chain X is not registered` | Chain config not loaded | Ensure chain is in `SUPPORTED_CHAINS` or registered manually |
| Test skipped with `⏭` | Missing env vars | Set required environment variables (see `.env.example`) |

## RPC Providers (Free Tiers)

| Provider | Free Tier | Sign Up |
|----------|-----------|---------|
| Alchemy | 300M compute units/mo | [alchemy.com](https://alchemy.com) |
| Infura | 100K requests/day | [infura.io](https://infura.io) |
| Ankr | Public RPCs (no key) | [rpc.ankr.com](https://rpc.ankr.com) |
| QuickNode | 10M API credits/mo | [quicknode.com](https://quicknode.com) |
