# Task: Stage 3 — Live Integration & Testnet Deployment

## Stage 3 Phase A: Token Enrichment & Registry Expansion
- [x] Expand `DEFAULT_TOKENS` with USDT, WETH, WBTC, DAI (mainnet chains)
- [x] Add `TESTNET_TOKENS` constant — USDC on Sepolia, Arbitrum Sepolia, Unichain Sepolia
- [x] Add `resolveFromSymbol(symbol, chainId)` helper to TokenRegistry
- [x] Create `src/shared/token-registry/enrichment.ts` — `enrichIntent()` fills in token addresses
- [x] Create `src/shared/chain-registry/configs/sepolia.ts` — Sepolia ChainConfig
- [x] Create `src/shared/chain-registry/configs/arbitrum-sepolia.ts` and `unichain-sepolia.ts`
- [x] Create `tests/shared/token-enrichment.test.ts` — unit tests for enrichment layer

---

## Stage 3 Phase B: viem Integration (RPC + Wallet)
- [x] Install `viem` dependency
- [x] Create `src/shared/rpc/viem-provider.ts` — `IRPCProvider` implementation with viem
  - [x] `createPublicClient` + `http` transport
  - [x] Implement `call()`, `getBlockNumber()`, `getTransactionReceipt()`, `getGasPrice()`
  - [x] Add `sendTransaction()` and `estimateGas()` to `IRPCProvider` interface
- [x] Create `src/shared/wallet-manager/viem-signer.ts` — `WalletSigner` implementation
  - [x] `privateKeyToAccount()` → `getAddress()`
  - [x] `signMessage()` and `signTypedData()` (EIP-712)
- [x] Export `createViemProviderFactory()` and `createViemSignerFactory()`
- [x] Create `tests/shared/viem-integration.test.ts` — connects to testnets, derives address

---

## Stage 3 Phase C: Live ERC-20 Transfer Execution
- [x] Modify `LiquidityAgent.sendOnTargetChain()` for live mode
  - [x] Build ERC-20 `transfer(recipient, amount)` calldata (via `erc20-utils.ts`)
  - [x] Estimate gas via provider
  - [x] Sign and broadcast tx via WalletClient & WalletManager
  - [x] Wait for 1 confirmation, return real `txHash`
- [x] Modify `InventoryManager.loadBalances()` — query real on-chain balances
- [x] Add `refreshBalance(chainId, token)` for on-demand refresh
- [x] Create `tests/live/erc20-transfer.test.ts` — real USDC transfer on Unichain Sepolia (guarded)

---

## Stage 3 Phase D: Live Protocol Integration (LiFi + Aave)
- [x] Replace `SwingProtocol` with `LiFiProtocol` (public API, no key needed)
  - [x] Implement `quote()` via `https://li.quest/v1/quote`
  - [x] Update `Rebalancer` to use LiFi integration
- [x] Fix `AaveProtocol.getAPY()` — replace hardcoded 4.5% with on-chain `getReserveData()`
  - [x] Parse `liquidityRate` (ray, 27 decimals) into APY %
- [x] Create `tests/live/lifi-api.test.ts` — real quotes between Polygon and Arbitrum
- [x] Create `tests/live/aave-onchain.test.ts` — guarded, needs `ETH_RPC_URL`

---

## Stage 3 Phase E: Contract Deployment & Live Settlement
- [x] Create Unichain Sepolia deploy script (`deploy-unichain-sepolia.ts`)
- [x] Modify `LiveSettlementManager.settleOnChain()` — build real `claim()` tx via viem
  - [x] Generate oracle signature, broadcast, wait for receipt
  - [x] Extract blockNumber directly from transaction receipt
- [x] Create `.env.example` with all required env vars
- [x] Create `tests/live/settlement-onchain.test.ts` — fully working E2E guarded on-chain test

---

## Stage 3 Phase F: End-to-End Testnet Integration Tests
- [x] Create `tests/e2e/testnet-bridge.test.ts` — full pipeline on testnet
  - [x] Parse text → enrich → solve → transfer USDC → settle
  - [x] Verify on-chain balance change (T6 completed)
  - [x] Verify `IntentFilled` event emitted (T5 & T6 completed)
- [x] Create `tests/e2e/testnet-health.test.ts` — HealthChecker against real RPCs
- [x] Update `README.md` — testnet deployment guide, `.env` config section

---

## Stage 3 Bug Fixes (Completed)
- [x] Fix `ChainRegistry` initialization (auto-register `SUPPORTED_CHAINS` in `IntentSolver` constructor)
- [x] Fix Oracle Signature mismatch in `ProofGenerator` (digest now matches on-chain `keccak256(abi.encode(order))` computation)

---

## Stage 3 Phase G: Documentation & Production Hardening
- [x] Create `docs/DEPLOYMENT.md` — step-by-step testnet guide
- [x] Create `docs/TESTNET_GUIDE.md` — faucets, funding, troubleshooting
- [x] Add retry with exponential backoff for failed transactions (`src/shared/utils/retry.ts`)
- [x] Add graceful RPC degradation — `ViemProvider` wrapped with `withRetry()` for transient errors
- [x] Add proper error messages with chain names (`chain-names.ts`, `getChainDisplayName()`)
- [x] Clean up debug `console.log` statements from production code
- [x] Update `README.md` — testnet section, env config, new doc links, updated project structure
- [x] Create `tests/shared/retry.test.ts` — 11 unit tests for retry utility
- [x] Final full regression test run (464 pass, 6 pre-existing failures)
