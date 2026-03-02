# Stage 3: Live Integration & Testnet Deployment

## Goal

Transform the Intent Parser SDK from a **fully mocked** development SDK into a **production-ready** system that connects to real blockchain networks (testnets first), executes real ERC-20 transfers, and interacts with live protocol APIs (Swing, Aave).

## Background — What Stage 2 Left Us

Stage 2 built the entire internal architecture with **mock subsystems**:
- `WalletManager` — has `signerFactory` pattern but no real crypto library wired
- `RPCProviderManager` — has `providerFactory` pattern but no real RPC provider wired
- `TokenRegistry` — has `DEFAULT_TOKENS` for USDC on 3 mainnet chains, needs testnet tokens
- `SwingProtocol` — has `FetchHttpClient` ready, but never tested against real Swing API
- `AaveProtocol` — has `getAPY()` returning hardcoded `4.5%`, needs on-chain query
- `IntentSettlement.sol` — compiled and unit-tested, deploy scripts ready for Sepolia
- `LiquidityAgent.sendOnTargetChain()` — returns fake txHash in simulate mode

Stage 3 replaces every mock with a real implementation.

---

## Architecture Overview

```
                           ┌──────────────────────┐
                           │    User / Frontend    │
                           └──────────┬───────────┘
                                      │ "Bridge 100 USDC to Arbitrum"
                                      ▼
                           ┌──────────────────────┐
                           │    IntentParser       │ ← Stage 1 (done)
                           └──────────┬───────────┘
                                      │ ParseResult { intentType, parameters }
                                      ▼
                    ┌─────────────────────────────────────┐
                    │        Token Enrichment Layer        │ ← Phase A (NEW)
                    │   TokenRegistry.get("USDC", 42161)  │
                    │   → resolves contract address       │
                    └─────────────────┬───────────────────┘
                                      │ SolverIntent (enriched with addresses)
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         IntentSolver                                   │
│                                                                        │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────────────┐    │
│  │ viem/ethers  │   │  Swing API      │   │  Aave On-Chain       │    │
│  │ Providers    │   │  (Live HTTP)    │   │  (getReserveData)    │    │
│  │ Phase B      │   │  Phase D        │   │  Phase D             │    │
│  └──────┬──────┘   └────────┬────────┘   └──────────┬───────────┘    │
│         │                    │                        │                │
│  ┌──────┴──────┐   ┌────────┴────────┐   ┌──────────┴───────────┐    │
│  │ WalletMgr   │   │  Rebalancer     │   │  Yield Optimizer     │    │
│  │ (real sign) │   │  (real bridge)  │   │  (real deposit)      │    │
│  │ Phase B     │   │  Phase D        │   │  Phase D             │    │
│  └──────┬──────┘   └─────────────────┘   └──────────────────────┘    │
│         │                                                             │
│  ┌──────┴──────────────────────────────────────────────────────┐     │
│  │  LiquidityAgent.sendOnTargetChain() — REAL ERC-20 transfer  │     │
│  │  Phase C                                                     │     │
│  └──────┬──────────────────────────────────────────────────────┘     │
│         │                                                             │
│  ┌──────┴──────────────────────────────────────────────────────┐     │
│  │  IntentSettlement.sol — deployed on Sepolia / Arb Sepolia   │     │
│  │  Phase E                                                     │     │
│  └──────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │     E2E Testnet Integration Tests    │ ← Phase F
                    │     (Sepolia USDC, real tx, real     │
                    │      settlement on-chain)            │
                    └─────────────────────────────────────┘
```

---

## Proposed Changes — Phase Breakdown

### Phase A: Token Enrichment & Registry Expansion ✅
**Goal:** Expand `TokenRegistry` with testnet tokens and create an enrichment layer that auto-resolves `inputTokenAddress` from parser output.

#### [MODIFY] [registry.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/token-registry/registry.ts)
- Add `TESTNET_TOKENS` constant: USDC on Sepolia (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`), Arbitrum Sepolia, Base Sepolia
- Add `MAINNET_TOKENS` constant: USDT, WETH, WBTC, DAI on Ethereum/Arbitrum/Optimism
- Add `resolveFromSymbol(symbol, chainId)` helper that returns address or throws

#### [NEW] [enrichment.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/token-registry/enrichment.ts)
- `enrichIntent(parsedResult, sourceChainId, targetChainId)` — takes parser output, fills in `inputTokenAddress`, `outputTokenAddress` from TokenRegistry
- Used between Parser and Solver to bridge the gap

#### [NEW] [configs/sepolia.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/chain-registry/configs/sepolia.ts)
- `ChainConfig` for Ethereum Sepolia (chainId: 11155111)

#### [NEW] [configs/arbitrum-sepolia.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/chain-registry/configs/arbitrum-sepolia.ts)
- `ChainConfig` for Arbitrum Sepolia (chainId: 421614)

---

### Phase B: viem Integration (RPC + Wallet) ✅
**Goal:** Wire real blockchain providers and wallet signing using `viem` library.

#### [NEW] [viem-provider.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/rpc/viem-provider.ts)
- Implement `IRPCProvider` interface using `viem`'s `createPublicClient` + `http` transport
- Methods: `call()`, `getBlockNumber()`, `getTransactionReceipt()`, `getGasPrice()`, `isHealthy()`
- Export a `createViemProviderFactory(): ProviderFactory` function

#### [NEW] [viem-signer.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/wallet-manager/viem-signer.ts)
- Implement `WalletSigner` interface using `viem`'s `createWalletClient` + `privateKeyToAccount`
- Methods: `getAddress()`, `signMessage()`, `signTypedData()` (EIP-712)
- Export `createViemSignerFactory(): (privateKey, chainId) => WalletSigner`

#### [MODIFY] [provider-manager.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/shared/rpc/provider-manager.ts)
- Add `sendTransaction(chainId, signedTx)` method to `IRPCProvider` interface
- Add `estimateGas(chainId, tx)` method

#### [NEW] [tests/shared/viem-integration.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/shared/viem-integration.test.ts)
- Test viem provider connects to Sepolia RPC
- Test viem signer derives correct address from private key
- Test signing and verifying a message

---

### Phase C: Live ERC-20 Transfer Execution ✅
**Goal:** Replace `sendOnTargetChain()` mock with real ERC-20 `transfer()` call.

#### [MODIFY] [liquidity-agent.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/agent/liquidity-agent.ts)
- In `sendOnTargetChain()`: when `mode === "live"`, use `viem` WalletClient to:
  1. Build ERC-20 `transfer(recipient, amount)` calldata
  2. Estimate gas
  3. Sign and broadcast transaction
  4. Wait for transaction receipt (1 confirmation)
  5. Return real `txHash`

#### [MODIFY] [inventory-manager.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/inventory/inventory-manager.ts)
- In `loadBalances()`: use `RPCProviderManager.getTokenBalance()` to query real on-chain balances via `balanceOf()`
- Add `refreshBalance(chainId, token)` for on-demand single-token refresh

#### [NEW] [tests/live/erc20-transfer.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/live/erc20-transfer.test.ts)
- Test real USDC transfer on Sepolia (requires funded test wallet)
- Verify balance change after transfer
- Guard: skip if `SOLVER_PRIVATE_KEY` env var not set

---

### Phase D: Live Protocol Integration (Swing + Aave)
**Goal:** Validate Swing and Aave adapters against live APIs/contracts.

#### [MODIFY] [swing.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/protocols/aggregators/swing.ts)
- Validate response shape against real Swing API v0
- Add error handling for rate limits (429), auth failures (401)
- Add `getTokens(chainId)` method for token discovery

#### [MODIFY] [aave.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/protocols/lending/aave.ts)
- Replace hardcoded `4.5%` APY with real `getReserveData()` on-chain call via `RPCProviderManager`
- Parse `liquidityRate` (ray, 27 decimals) → APY percentage

#### [NEW] [tests/live/swing-api.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/live/swing-api.test.ts)
- Test `quote()` against real Swing API (Ethereum → Arbitrum USDC)
- Test `getTransferStatus()` with known transfer ID
- Guard: skip if `SWING_API_KEY` env var not set

#### [NEW] [tests/live/aave-onchain.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/live/aave-onchain.test.ts)
- Test `getAPY("USDC", 1)` returns a real number > 0
- Guard: skip if `ETH_RPC_URL` env var not set

---

### Phase E: Contract Deployment & Live Settlement ✅
**Goal:** Deploy `IntentSettlement.sol` to testnets and wire the `LiveSettlementManager` to call real on-chain `claim()`.

#### [MODIFY] [deploy-unichain-sepolia.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/contracts/deploy/deploy-unichain-sepolia.ts)
- Update to deploy to Unichain Sepolia (chainId 1301)
- Uses UUPS proxy pattern and outputs deployed proxy/impl addresses to JSON config and `.env`.

#### [NEW] [viem-settlement-contract.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/contracts/intent-settlement/viem-settlement-contract.ts)
- Viem wrapper defining IntentSettlement ABI.
- Implements `claim()` to submit the oracle signature and order data. Uses `simulateContract` before broadcasting to catch reverts. Returns the actual blockNumber.

#### [NEW] [live-settlement-manager.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/src/solver/settlement/live-settlement-manager.ts)
- In `settleOnChain()`: build parameters for `claim()` using viem.
- Submit the oracle signature, broadcast, wait for receipt, and return structured timestamp and block data.

#### [NEW] [tests/live/settlement-onchain.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/live/settlement-onchain.test.ts)
- Fully guarded on-chain suite connecting to Unichain Sepolia.
- Test 5 includes a complete End-To-End EIP-712 flow: Setup -> Approve -> Open -> Generate Oracle Signature (tightly packed bytes32) -> Claim, asserting full `blockNumber` and `isSettled` verification.

#### [MODIFY] [.env.example](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/.env.example)
- Includes necessary keys: `SOLVER_PRIVATE_KEY`, `TESTING_USER_PRIVATE_KEY`, `UNICHAIN_SEPOLIA_RPC_URL`, and `SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA`.

---

### Phase F: End-to-End Testnet Integration Tests ✅
**Goal:** Full pipeline test on real testnets: parse text → enrich → solve → transfer USDC → settle on-chain.

#### [NEW/DONE] [tests/e2e/testnet-bridge.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/e2e/testnet-bridge.test.ts)
- [x] Parse "Bridge 1 USDC from Unichain Sepolia to Base Sepolia"
- [x] Enrich with token addresses
- [x] Execute solve (real ERC-20 transfer on Base Sepolia)
- [x] Verify on-chain balance change
- [x] Verify settlement proof submitted (full lifecycle: open → fill → claim)
- [x] Guard: skip if testnet env vars not configured

#### [NEW] [tests/e2e/testnet-health.test.ts](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/tests/e2e/testnet-health.test.ts)
- Test `HealthChecker` against real RPC endpoints
- Verify all registered chains report healthy

#### [MODIFY] [README.md](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/README.md)
- Add testnet deployment guide
- Add `.env` configuration section
- Add E2E test instructions

---

### Phase G: Documentation & Production Hardening
**Goal:** Production readiness — error handling, retry logic, environment config, and deployment guide.

#### [NEW] [docs/DEPLOYMENT.md](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/docs/DEPLOYMENT.md)
- Step-by-step testnet deployment guide
- Contract deployment instructions
- How to fund test wallets with Sepolia USDC
- Environment variable reference

#### [NEW] [docs/TESTNET_GUIDE.md](file:///c:/Users/Dimas%20Kusuma%20Aryan/Documents/latihan/intent-parser-sdk/docs/TESTNET_GUIDE.md)
- Faucet links for Sepolia ETH + USDC
- How to run E2E tests
- Troubleshooting common issues

#### [MODIFY] Various files
- Add proper error messages with chain names (not just IDs)
- Add graceful degradation when RPC is down
- Add retry with exponential backoff for failed transactions

---

## Environment Variables Required

| Variable | Purpose |Example |
|----------|---------|--------|
| `SOLVER_PRIVATE_KEY` | Solver wallet private key | `0xabc...` |
| `SEPOLIA_RPC_URL` | Ethereum Sepolia RPC | `https://eth-sepolia.g.alchemy.com/v2/KEY` |
| `ARB_SEPOLIA_RPC_URL` | Arbitrum Sepolia RPC | `https://arb-sepolia.g.alchemy.com/v2/KEY` |
| `SETTLEMENT_CONTRACT_SEPOLIA` | Deployed contract address | `0x...` |
| `SETTLEMENT_CONTRACT_ARB_SEPOLIA` | Deployed contract address | `0x...` |
| `SWING_API_KEY` | Swing.xyz API key (optional) | `sk_...` |

---

## Verification Plan

### Automated Tests
```bash
# Unit tests (Stage 1 + 2, should still pass)
bun test tests/parser/ tests/solver/

# Integration tests (Stage 2, mock-based)
bun test tests/integration/

# Live tests (Stage 3, requires RPC + funded wallet)
SOLVER_PRIVATE_KEY=0x... SEPOLIA_RPC_URL=https://... bun test tests/live/

# E2E tests (Stage 3, full pipeline on testnet)
SOLVER_PRIVATE_KEY=0x... bun test tests/e2e/
```

### Manual Verification
- Deploy contracts via Hardhat to Sepolia + Arbitrum Sepolia
- Fund solver wallet with testnet ETH + USDC
- Run `examples/basic-bridge.ts` in live mode and verify tx on Etherscan
- Check `IntentFilled` event on settlement contract via block explorer
