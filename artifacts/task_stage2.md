# Task: Stage 2 — Solver / Liquidity Agent

## Stage 2 Phase A: Core Types & Foundation ✅
- [x] Solver types (`agent.ts`, `inventory.ts`, `intent.ts`, `settlement.ts`, `pricing.ts`, `execution.ts`, `index.ts`)
- [x] Global types (`common.ts`, `chain.ts`)
- [x] Errors (`solver-errors.ts`, `inventory-errors.ts`, `settlement-errors.ts`)
- [x] Config (`default.ts`, `chains.ts`)
- [x] Shared services (`chain-registry`, `wallet-manager`, `rpc/provider-manager`, `token-registry`)
- [x] Tests — `tests/solver/foundation.test.ts` — **54 tests passing** ✅

---

## Stage 2 Phase B: Inventory Management ✅
- [x] `src/solver/inventory/inventory-manager.ts` — load, get, lock, unlock, confirmDeduction, snapshot
- [x] `src/solver/inventory/inventory-monitor.ts` — polling balance setiap 30s
- [x] `src/solver/inventory/rebalancer.ts` — needsRebalancing, execute, autoRebalance
- [x] `src/solver/inventory/index.ts`
- [x] Tests — `tests/solver/inventory.test.ts` — **15 tests passing** ✅

---

## Stage 2 Phase C: Pricing Engine ✅
- [x] `src/solver/pricing/fee-calculator.ts` — calculate, calculateBaseFee, estimateGasCost, isWorthSolving
- [x] `src/solver/pricing/slippage-capture.ts` — calculate, getEffectiveUserOutput
- [x] `src/solver/pricing/dynamic-pricing.ts` — getPrice, getInventoryMultiplier, shouldReject
- [x] `src/solver/pricing/index.ts`
- [x] Tests — `tests/solver/pricing.test.ts` ✅

---

## Stage 2 Phase D: Smart Contracts ✅
- [x] `contracts/src/interfaces/IERC7683.sol`, `IERC1271.sol`
- [x] `contracts/src/IntentSettlement.sol` — ERC-7683, ERC-712, UUPS
- [x] `contracts/test/IntentSettlement.test.ts` — **6/6 passing** ✅
- [x] `contracts/deploy/deploy-unichain-sepolia.ts`, `deploy-base-sepolia.ts`
- [x] `src/solver/contracts/intent-settlement/intent-settlement.ts` — TypeScript wrapper
- [x] `src/solver/contracts/intent-settlement/index.ts`
- [x] Code Review & Fixes ✅

---

## Stage 2 Phase E: Settlement & Proof System ✅
- [x] Implement `src/solver/settlement/proof-generator.ts` ✅
  - [x] `generateSignatureProof(params)` — sign message for Oracle signature
  - [x] `waitForConfirmations(txHash, chainId, confirmations)` — poll receipt
- [x] Implement `src/solver/settlement/proof-verifier.ts` ✅
  - [x] `verifySignatureProof(proof, expectedSigner)` — recover & verify signer
- [x] Implement `src/solver/settlement/settlement-manager.ts` ✅
  - [x] `settleIntent(intent, targetTxHash)` — full settle flow converting to CrossChainOrder
  - [x] `watchPendingSettlements()` — interval re-check pending
  - [x] `handleClaimFailure(intentId, error)` — retry max 3x
- [x] Implement `src/solver/settlement/index.ts` ✅
- [x] Implement `tests/solver/settlement.test.ts` ✅ (14 pass, 0 fail)
  - [x] Test proof generation
  - [x] Test proof verification
  - [x] Test full settlement flow
  - [x] Test retry on failure

---

## Stage 2 Phase F: Core Liquidity Agent ✅
- [x] Create `src/solver/agent/agent-config.ts` — `LiquidityAgentConfig`, `buildAgentConfig()` ✅
- [x] Create `src/solver/agent/liquidity-agent.ts` ✅
  - [x] `initialize()`, `canSolve(intent)`, `getQuote(intent)`, `solve(intent)`
  - [x] `start(mempoolUrl?)`, `stop()`, `getStatus()`
  - [x] Private `sendOnTargetChain()`
- [x] Create `src/solver/agent/index.ts` ✅
- [x] Create `tests/solver/liquidity-agent.test.ts` ✅ (16 pass, 0 fail)

---

## Stage 2 Phase G: Mempool Integration ✅
- [x] Create `src/solver/mempool/mempool-client.ts` — WebSocket + EventEmitter ✅
- [x] Create `src/solver/mempool/intent-filter.ts` — dedup + type + canSolve ✅
- [x] Create `src/solver/mempool/mempool-monitor.ts` — listen → filter → solve → submit ✅
- [x] Create `src/solver/mempool/solution-submitter.ts` — submit + race condition handling ✅
- [x] Create `src/solver/mempool/index.ts` ✅
- [x] Create `tests/solver/mempool.test.ts` ✅ (20 pass, 0 fail)

---

## Stage 2 Phase H: Monitoring & Profit Tracking ✅
- [x] Create `src/solver/monitoring/profit-tracker.ts` — recordAttempt, recordResult, getStats, getROI ✅
- [x] Create `src/solver/monitoring/health-checker.ts` — check (RPC, contracts, mempool, inventory), isHealthy ✅
- [x] Create `src/solver/monitoring/alert-manager.ts` — alert, alertLowInventory, alertFailedClaim ✅
- [x] Create `src/solver/monitoring/index.ts` ✅
- [x] Create `tests/solver/monitoring.test.ts` ✅ (15 pass, 0 fail)

---

## Stage 2 Phase I: Protocols for Rebalancing ✅
- [x] Create `src/solver/protocols/base-protocol.ts` — abstract `BaseProtocol` ✅
- [x] Create `src/solver/protocols/protocol-registry.ts` — register, get, getBestBridge ✅
- [x] Create `src/solver/protocols/aggregators/swing.ts` — quote, buildTransaction, getTransferStatus ✅
- [x] Create `src/solver/protocols/lending/aave.ts` — getAPY, deposit, withdraw ✅
- [x] Create `src/solver/protocols/index.ts` ✅
- [x] Create `tests/solver/protocols.test.ts` ✅ (9 pass, 0 fail)

---

## Stage 2 Phase J: ERC-8004 Registry & x402 Monetization ⏭️ (DEFERRED — additional feature)
- [ ] Create `src/solver/contracts/agent-registry/erc-8004.ts` — register, updateReputation, getAgent
- [ ] Create `src/solver/monetization/x402-server.ts` — HTTP 402 middleware, L402 invoices
- [ ] Create `src/solver/monetization/invoice-manager.ts` — verify payments
- [ ] Create `src/solver/contracts/agent-registry/index.ts`
- [ ] Create `src/solver/contracts/index.ts`

---

## Stage 2 Phase K: Main Export & Examples
- [x] Create `src/solver/index.ts` — `IntentSolver` public wrapper class
- [x] Modify `src/index.ts` — export `IntentParser`, `IntentSolver`, `createIntentSDK()`
- [x] Create `examples/basic-bridge.ts`
- [x] Create `examples/autonomous-agent.ts`
- [x] Create `examples/inventory-management.ts`

---

## Stage 2 Phase L: Integration Tests & Docs
- [ ] Create `tests/integration/full-bridge-flow.test.ts` — parse → solve → settle (mock)
- [ ] Create `tests/integration/edge-cases.test.ts` — expired, insufficient, failed claim, concurrent
- [ ] Create `docs/SOLVER.md` — architecture, concepts, config, fee structure, API reference
- [ ] Update `README.md` — solver section, quick start, chains, economics
