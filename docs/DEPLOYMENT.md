# Deployment Guide

Step-by-step guide to deploy the Intent Parser SDK's smart contracts and configure the solver for testnet operation.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Bun** | ≥ 1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Hardhat** | (bundled) | Included in `contracts/` workspace |

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd intent-parser-sdk
bun install

# Install contract dependencies
cd contracts
npm install
cd ..
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLVER_PRIVATE_KEY` | ✅ | Hex private key (with `0x` prefix) for the solver wallet |
| `UNICHAIN_SEPOLIA_RPC_URL` | ✅ | RPC endpoint for Unichain Sepolia (chainId 1301) |
| `SEPOLIA_RPC_URL` | Optional | Ethereum Sepolia RPC |
| `ARB_SEPOLIA_RPC_URL` | Optional | Arbitrum Sepolia RPC |
| `ETH_RPC_URL` | Optional | Ethereum Mainnet RPC (for Aave reads) |

> [!IMPORTANT]
> **Never commit your `.env` file.** It contains private keys. The `.gitignore` already excludes it.

## 3. Fund the Solver Wallet

Before deploying or running live tests, your solver wallet needs:

- **Unichain Sepolia ETH** — for gas fees (see [Testnet Guide](./TESTNET_GUIDE.md) for faucets)
- **Testnet USDC** — for ERC-20 transfer tests

Derive your wallet address:

```bash
npx tsx -e "
  const { privateKeyToAccount } = require('viem/accounts');
  console.log(privateKeyToAccount(process.env.SOLVER_PRIVATE_KEY).address);
"
```

## 4. Deploy IntentSettlement Contract

### Unichain Sepolia (Primary Testnet)

```bash
cd contracts
npx hardhat run deploy/deploy-unichain-sepolia.ts --network unichainSepolia
```

On success, the script outputs:

```
✅ IntentSettlement deployed!
   Proxy:          0x7066f6dFc1C652c165Bc9BB10085fD95719b5eA6
   Implementation: 0x...
```

The proxy address is automatically written to `deployed-addresses.json` and should be set as:

```env
SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA=0x7066f6dFc1C652c165Bc9BB10085fD95719b5eA6
```

### Verify on Block Explorer

Visit the deployed contract on [Unichain Sepolia Blockscout](https://unichain-sepolia.blockscout.com/) and confirm:

1. The proxy contract exists at the logged address
2. The implementation contract is linked
3. The `oracle()` function returns your solver address

## 5. Run Live Tests

```bash
# Unit + integration tests (no env vars needed)
bun test tests/parser/ tests/solver/ tests/integration/ tests/shared/

# Live tests (requires funded wallet + RPC)
bun test tests/live/

# End-to-end testnet tests (full pipeline)
bun test tests/e2e/
```

## 6. Post-Deployment Checklist

- [ ] Contract deployed and verified on block explorer
- [ ] `deployed-addresses.json` updated with proxy address
- [ ] `.env` populated with contract address and RPC URLs
- [ ] Solver wallet funded with testnet ETH + USDC
- [ ] `bun test tests/live/settlement-onchain.test.ts` passes
- [ ] `bun test tests/e2e/testnet-bridge.test.ts` passes

## Upgrading the Contract

The `IntentSettlement` contract uses the UUPS proxy pattern. To upgrade:

```bash
cd contracts
npx hardhat run deploy/upgrade-unichain-sepolia.ts --network unichainSepolia
```

The proxy address stays the same; only the implementation changes.
