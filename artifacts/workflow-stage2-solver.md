# Intent SDK - Solver: Liquidity Agent Implementation Plan

## Project Structure

```
src/
├── parser/                                    # Phase 1 - COMPLETED ✅
│
├── solver/
│   ├── agent/
│   │   ├── liquidity-agent.ts                 # Main agent class
│   │   ├── agent-config.ts                    # Configuration
│   │   └── index.ts
│   │
│   ├── inventory/
│   │   ├── inventory-manager.ts               # Track balances per chain
│   │   ├── inventory-monitor.ts               # Monitor balance changes
│   │   ├── rebalancer.ts                      # Auto rebalancing via Swing
│   │   └── index.ts
│   │
│   ├── pricing/
│   │   ├── fee-calculator.ts                  # Base fee calculation
│   │   ├── slippage-capture.ts                # Slippage profit
│   │   ├── dynamic-pricing.ts                 # Inventory-based dynamic fee
│   │   └── index.ts
│   │
│   ├── protocols/
│   │   ├── base-protocol.ts
│   │   ├── protocol-registry.ts
│   │   ├── aggregators/
│   │   │   ├── swing.ts                       # Rebalancing
│   │   │   └── index.ts
│   │   ├── lending/
│   │   │   ├── aave.ts                        # Yield on idle inventory
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── execution/
│   │   ├── transaction-builder.ts
│   │   ├── transaction-executor.ts
│   │   ├── multi-chain-executor.ts
│   │   └── index.ts
│   │
│   ├── settlement/
│   │   ├── settlement-manager.ts
│   │   ├── proof-generator.ts
│   │   ├── proof-verifier.ts
│   │   └── index.ts
│   │
│   ├── mempool/
│   │   ├── mempool-client.ts
│   │   ├── mempool-monitor.ts
│   │   ├── intent-filter.ts
│   │   ├── solution-submitter.ts
│   │   └── index.ts
│   │
│   ├── contracts/
│   │   ├── intent-settlement/
│   │   │   ├── intent-settlement.ts
│   │   │   └── index.ts
│   │   ├── agent-registry/
│   │   │   ├── erc-8004.ts
│   │   │   └── index.ts
│   │   ├── cross-chain/
│   │   │   ├── eip-7683.ts
│   │   │   └── index.ts
│   │   ├── abis/
│   │   │   ├── IntentSettlement.json
│   │   │   └── ERC8004.json
│   │   └── index.ts
│   │
│   ├── monitoring/
│   │   ├── profit-tracker.ts
│   │   ├── health-checker.ts
│   │   ├── alert-manager.ts
│   │   └── index.ts
│   │
│   ├── types/
│   │   ├── agent.ts
│   │   ├── inventory.ts
│   │   ├── intent.ts
│   │   ├── settlement.ts
│   │   ├── pricing.ts
│   │   ├── execution.ts
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── retry.ts
│   │   ├── timeout.ts
│   │   ├── logger.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── contracts/                                 # Solidity Smart Contracts
│   ├── src/
│   │   ├── IntentSettlement.sol
│   │   ├── IntentEscrow.sol
│   │   └── interfaces/
│   ├── test/
│   └── deploy/
│       ├── deploy-ethereum.ts
│       └── deploy-polygon.ts
│
├── shared/
│   ├── chain-registry/
│   │   ├── registry.ts
│   │   └── configs/
│   │       ├── ethereum.ts
│   │       ├── polygon.ts
│   │       └── arbitrum.ts
│   ├── token-registry/
│   ├── wallet-manager/
│   │   └── wallet-manager.ts
│   └── rpc/
│       └── provider-manager.ts
│
├── types/
│   ├── common.ts
│   ├── chain.ts
│   └── token.ts
│
├── config/
│   ├── default.ts
│   └── chains.ts
│
├── errors/
│   ├── solver-errors.ts
│   ├── inventory-errors.ts
│   └── settlement-errors.ts
│
└── index.ts
```

---

## Development Phases

## Stage 2 Phase A: Core Types & Foundation (Week 1)

**Goal:** Setup semua types, config, errors, shared services.

### • Solver Types

- [ ] **Create `src/solver/types/agent.ts`**
  - [ ] Define `AgentConfig interface`
    - Fields: `name`, `privateKey`, `supportedChains`, `supportedTokens`, `mode`
  - [ ] Define `AgentStatus enum`
    - Values: `'idle' | 'processing' | 'rebalancing' | 'error'`
  - [ ] Define `SolutionResult type`
    - Fields: `success`, `txHash`, `profit`, `output`, `error`, `metadata`

- [ ] **Create `src/solver/types/inventory.ts`**
  - [ ] Define `InventoryBalance type`
    - Fields: `chainId`, `token`, `available`, `locked`, `lastUpdated`
  - [ ] Define `InventorySnapshot type`
    - Fields: `balances`, `totalUSDValue`, `timestamp`
  - [ ] Define `RebalanceTask type`
    - Fields: `fromChain`, `toChain`, `token`, `amount`, `reason`, `priority`

- [ ] **Create `src/solver/types/intent.ts`**
  - [ ] Define `SolverIntent type`
    - Fields: `intentId`, `intentHash`, `user`, `signature`, `deadline`, `status`
  - [ ] Define `IntentStatus enum`
    - Values: `'pending' | 'matched' | 'fulfilling' | 'fulfilled' | 'failed' | 'refunded'`
  - [ ] Define `BridgeIntent type`
    - Fields: `sourceChain`, `targetChain`, `token`, `amount`, `recipient`, `maxSlippage`

- [ ] **Create `src/solver/types/settlement.ts`**
  - [ ] Define `Settlement type`
    - Fields: `intentId`, `solver`, `sourceTx`, `targetTx`, `proof`, `status`, `settledAt`
  - [ ] Define `CrossChainProof type`
    - Fields: `txHash`, `chainId`, `blockNumber`, `solverSignature`

- [ ] **Create `src/solver/types/pricing.ts`**
  - [ ] Define `PricingResult type`
    - Fields: `baseFee`, `gasCost`, `slippageCapture`, `totalFee`, `userPays`, `userReceives`, `solverProfit`
  - [ ] Define `PricingConfig type`
    - Fields: `baseFeePercent`, `minFeeUSD`, `maxFeePercent`, `slippageSharePercent`

- [ ] **Create `src/solver/types/execution.ts`**
  - [ ] Define `Transaction type`
    - Fields: `to`, `data`, `value`, `gasLimit`, `chainId`, `nonce`
  - [ ] Define `ExecutionResult type`
    - Fields: `success`, `txHash`, `gasUsed`, `blockNumber`, `error`
  - [ ] Define `MultiChainExecution type`
    - Fields: `sourceTx`, `targetTx`, `status`, `startedAt`, `completedAt`

### • Global Types

- [ ] **Create `src/types/common.ts`**
  - [ ] `Address type` (0x${string})
  - [ ] `Amount type` (string for bigint)
  - [ ] `ChainId type` (number)
  - [ ] `Hash type` (0x${string})

- [ ] **Create `src/types/chain.ts`**
  - [ ] `ChainConfig interface`: id, name, rpcUrl, fallbackRpcUrls, nativeCurrency, explorer, contracts

- [ ] **Create `src/types/token.ts`**
  - [ ] `Token interface`: address, symbol, decimals, chainId, name

### • Errors

- [ ] **Create `src/errors/solver-errors.ts`**
  - [ ] `SolverError` base class
  - [ ] `InsufficientInventoryError`(chain, token, required, available)
  - [ ] `IntentExpiredError`(intentId, deadline)
  - [ ] `UnsupportedIntentError`(intentType, reason)

- [ ] **Create `src/errors/inventory-errors.ts`**
  - [ ] `InventoryError` base class
  - [ ] `InventoryLockError`
  - [ ] `RebalancingFailedError`(fromChain, toChain, amount, reason)

- [ ] **Create `src/errors/settlement-errors.ts`**
  - [ ] `SettlementError` base class
  - [ ] `ProofGenerationError`
  - [ ] `ClaimFailedError`(intentId, reason)

### • Config

- [ ] **Create `src/config/default.ts`**
  - [ ] `DEFAULT_PRICING_CONFIG`: baseFeePercent: 0.005, minFeeUSD: 1, slippageSharePercent: 0.5
  - [ ] `DEFAULT_INVENTORY_CONFIG`: minReservePercent: 0.1, rebalanceThreshold: 0.15
  - [ ] `DEFAULT_AGENT_CONFIG`: mode: 'simulate', intentTimeout: 3600, maxConcurrentIntents: 5

- [ ] **Create `src/config/chains.ts`**
  - [ ] Ethereum: chainId 1, USDC 0xA0b86991...
  - [ ] Polygon: chainId 137, USDC 0x2791Bca1...

### • Shared Services

- [ ] **Create `src/shared/chain-registry/configs/ethereum.ts`**
  - [ ] Export `ETHEREUM_CONFIG` with RPC URLs, token addresses

- [ ] **Create `src/shared/chain-registry/configs/polygon.ts`**
  - [ ] Export `POLYGON_CONFIG`

- [ ] **Create `src/shared/chain-registry/registry.ts`**
  - [ ] `ChainRegistry class`
    - `register(config) → void`: Store config, throw if duplicate
    - `get(chainId) → ChainConfig`: Return or throw if not found
    - `list() → ChainConfig[]`: All chains

- [ ] **Create `src/shared/wallet-manager/wallet-manager.ts`**
  - [ ] `WalletManager class`: Constructor takes privateKey
    - `getWallet(chainId) → ethers.Wallet`: Connect wallet to chain's provider, cache it
    - `getAddress() → Address`: Agent's address (same all EVM chains)
    - `signMessage(message) → Promise<string>`: Sign with private key

- [ ] **Create `src/shared/rpc/provider-manager.ts`**
  - [ ] `RPCProviderManager class`
    - `getProvider(chainId) → ethers.JsonRpcProvider`: Create + cache, fallback if primary fails
    - `getTokenBalance(chainId, tokenAddress, walletAddress) → Promise<bigint>`: ERC20 balanceOf

- [ ] **Create `src/shared/token-registry/registry.ts`**
  - [ ] `TokenRegistry class`
    - `register(token)`, `get(symbol, chainId)`, `getByAddress(address, chainId)`
    - Pre-register USDC on ETH and Polygon

- [ ] **Create `tests/foundation.test.ts`**
  - [ ] Test ChainRegistry, WalletManager, TokenRegistry, RPCProvider

---

## Stage 2 Phase B: Inventory Management (Week 2)

**Goal:** Track dan manage USDC balance di semua chains.

- [ ] **Create `src/solver/inventory/inventory-manager.ts`**
  - [ ] `InventoryManager class`: Constructor (walletManager, tokenRegistry, chainRegistry)
    - `loadBalances() → Promise<void>`: Query USDC balance on each chain, populate Map
    - `getBalance(chainId, token) → bigint`: Return available - locked
    - `getTotalBalance(token) → bigint`: Sum all chains
    - `canFulfill(chainId, token, amount) → boolean`: Check balance >= amount + min reserve
    - `lockAmount(chainId, token, amount, intentId) → void`: Reserve for pending intent, throw if insufficient
    - `unlockAmount(chainId, token, amount, intentId) → void`: Release on success or failure
    - `confirmDeduction(chainId, token, amount, intentId) → void`: Permanently reduce after send
    - `getSnapshot() → InventorySnapshot`: Full snapshot with timestamp

- [ ] **Create `src/solver/inventory/inventory-monitor.ts`**
  - [ ] `InventoryMonitor class`
    - `start() → void`: Poll balances every 30s, alert if unexpected changes
    - `stop() → void`: Clear polling

- [ ] **Create `src/solver/inventory/rebalancer.ts`**
  - [ ] `Rebalancer class`: Constructor (inventoryManager, swingProtocol, config)
    - `needsRebalancing() → RebalanceTask[]`: Find chains > threshold off target distribution
    - `execute(task) → Promise<ExecutionResult>`: Bridge via Swing, wait for completion, update inventory
    - `autoRebalance() → Promise<void>`: Get all tasks, execute by priority, log costs

- [ ] **Create `tests/solver/inventory.test.ts`**
  - [ ] Test: load, canFulfill (true/false), lock/unlock, confirmDeduction, rebalancer tasks

---

## Stage 2 Phase C: Pricing Engine (Week 2-3)

**Goal:** Fee calculation dan dynamic pricing berdasarkan inventory level.

- [ ] **Create `src/solver/pricing/fee-calculator.ts`**
  - [ ] `FeeCalculator class`: Constructor (config: PricingConfig)
    - `calculate(params) → PricingResult`: Full breakdown (amount, sourceChain, targetChain, token)
    - `calculateBaseFee(amount) → bigint`: amount * baseFeePercent, enforce min fee
    - `estimateGasCost(chainId) → Promise<bigint>`: Gas price × gas units → USDC equivalent
    - `isWorthSolving(amount, sourceChain, targetChain) → Promise<boolean>`: fee > costs × 1.5

- [ ] **Create `src/solver/pricing/slippage-capture.ts`**
  - [ ] `SlippageCapture class`
    - `calculate(amount, maxSlippageBps) → bigint`: amount × maxSlippage × slippageSharePercent
    - `getEffectiveUserOutput(amount, capture) → bigint`: What user actually receives

- [ ] **Create `src/solver/pricing/dynamic-pricing.ts`**
  - [ ] `DynamicPricing class`: Constructor (inventoryManager, feeCalculator, config)
    - `getPrice(intent) → Promise<PricingResult>`: Base fee × inventory multiplier + slippage capture
    - `getInventoryMultiplier(chainId, amount) → number`: 0.8 if >80%, 1.0 if 50-80%, 1.5 if 20-50%, 2.0 if <20%
    - `shouldReject(chainId, amount) → boolean`: True if would leave <minimum reserve

- [ ] **Create `tests/solver/pricing.test.ts`**
  - [ ] Test: fee = 5 USDC for 1000 USDC, dynamic multipliers, slippage capture, rejection

---

## Stage 2 Phase D: Smart Contracts (Week 3-4)

**Goal:** Deploy settlement contracts on ETH and Polygon.

- [ ] **Create `contracts/src/IntentSettlement.sol`**
  - [ ] Struct `Intent`: intentId, user, solver, token, amount, fee, deadline, status
  - [ ] `lockFunds(intentId, solver, amount, fee, deadline)`:
    - Validate deadline not expired
    - USDC.transferFrom(user, contract, amount + fee)
    - Store intent, emit FundsLocked
  - [ ] `claimFunds(intentId, proof)`:
    - Require caller == solver
    - Verify proof (solver signature)
    - USDC.transfer(solver, amount + fee), emit FundsClaimed
  - [ ] `refund(intentId)`:
    - Require deadline passed AND not fulfilled
    - USDC.transfer(user, amount + fee), emit FundsRefunded
  - [ ] `getIntent(intentId)` view function

- [ ] **Create `contracts/test/IntentSettlement.test.ts`**
  - [ ] Test: lock, claim with valid proof, refund after deadline, reject invalid proof, reject double claim

- [ ] **Create `contracts/deploy/deploy-ethereum.ts` + `deploy-polygon.ts`**
  - [ ] Deploy with USDC address, save deployed address to config

- [ ] **Create `src/solver/contracts/intent-settlement/intent-settlement.ts`**
  - [ ] `IntentSettlementContract class`
    - `lockFunds(params) → Promise<ExecutionResult>`: Build + send tx, return hash
    - `claimFunds(intentId, proof) → Promise<ExecutionResult>`: Encode proof, send tx
    - `getIntent(intentId) → Promise<Intent>`: View call
    - `waitForLockEvent(intentId) → Promise<void>`: Subscribe to event, timeout 5 min

---

## Stage 2 Phase E: Settlement & Proof System (Week 4)

**Goal:** Atomic cross-chain settlement.

- [ ] **Create `src/solver/settlement/proof-generator.ts`**
  - [ ] `ProofGenerator class`: Constructor (walletManager, providerManager)
    - `generateSignatureProof(params) → Promise<CrossChainProof>`:
      - Create message = hash(intentId + targetTxHash + amount + recipient)
      - Sign with solver wallet, return CrossChainProof with signature
    - `waitForConfirmations(txHash, chainId, confirmations=12) → Promise<void>`: Poll receipts

- [ ] **Create `src/solver/settlement/proof-verifier.ts`**
  - [ ] `ProofVerifier class`
    - `verifySignatureProof(proof, expectedSolver) → boolean`: Recover signer, compare

- [ ] **Create `src/solver/settlement/settlement-manager.ts`**
  - [ ] `SettlementManager class`
    - `settleIntent(intent, targetTxHash) → Promise<Settlement>`:
      - Wait 12 confirmations
      - Generate signature proof
      - Call claimFunds on source chain
      - Wait for claim confirmation
      - Return settlement record
    - `watchPendingSettlements() → void`: Auto-settle queue, retry up to 3x
    - `handleClaimFailure(intentId, error) → Promise<void>`: Log critical alert, store for review

- [ ] **Create `tests/solver/settlement.test.ts`**
  - [ ] Test: proof generated, verified, full settlement flow, retry on failure

---

## Stage 2 Phase F: Core Liquidity Agent (Week 5)

**Goal:** Main agent menyatukan semua komponen.

- [ ] **Create `src/solver/agent/agent-config.ts`**
  - [ ] `LiquidityAgentConfig interface`: all config fields
  - [ ] `buildAgentConfig(partial) → LiquidityAgentConfig`: Merge with defaults, validate required fields

- [ ] **Create `src/solver/agent/liquidity-agent.ts`**
  - [ ] `LiquidityAgent class`: Constructor (config: LiquidityAgentConfig)
    - `initialize() → Promise<void>`: Load balances, verify contracts, register ERC-8004, start monitor
    - `canSolve(intent) → boolean`:
      - Check type = bridge, chains supported, token supported
      - Check deadline >now + 5min
      - Check inventoryManager.canFulfill(targetChain, token, amount)
      - Check pricing.isWorthSolving()
    - `getQuote(intent) → Promise<PricingResult>`: Call dynamicPricing.getPrice()
    - `solve(intent) → Promise<SolutionResult>`:
      - Validate intent
      - Get pricing
      - inventoryManager.lockAmount(targetChain, token, amount, intentId)
      - sendOnTargetChain(wallet, recipient, token, amount)
      - Wait for target confirmation
      - settlementManager.settleIntent(intent, targetTxHash) (claim on source)
      - inventoryManager.confirmDeduction()
      - profitTracker.recordResult()
      - rebalancer.autoRebalance() if needed
      - Return SolutionResult
    - `start(mempoolUrl?) → Promise<void>`: initialize + start mempool monitor
    - `stop() → Promise<void>`: graceful shutdown, wait for pending
    - `getStatus() → AgentStatus`: current status + balances + profit stats
    - Private `sendOnTargetChain(...) → Promise<ExecutionResult>`: ERC20 transfer on target chain

- [ ] **Create `tests/solver/liquidity-agent.test.ts`**
  - [ ] Test: initialize, canSolve (true/false cases), getQuote, solve simulate mode
  - [ ] Test: lock released on failure, profit tracked correctly

---

## Stage 2 Phase G: Mempool Integration (Week 6)

- [ ] **Create `src/solver/mempool/mempool-client.ts`**
  - [ ] `MempoolClient(url)`: connect(), disconnect(), on(event, cb), submitSolution(intentId, sol)

- [ ] **Create `src/solver/mempool/intent-filter.ts`**
  - [ ] `IntentFilter(agent)`: shouldSolve(intent) → Check type, canSolve, dedup

- [ ] **Create `src/solver/mempool/mempool-monitor.ts`**
  - [ ] `MempoolMonitor(client, filter, agent, submitter)`: start() listen + filter + queue, stop()

- [ ] **Create `src/solver/mempool/solution-submitter.ts`**
  - [ ] `SolutionSubmitter`: submit(intentId, result) → format + submit, handle "already solved"

- [ ] **Create `tests/solver/mempool.test.ts`**
  - [ ] Test: connect, filter, queue, dedup

---

## Stage 2 Phase H: Monitoring & Profit Tracking (Week 6)

- [ ] **Create `src/solver/monitoring/profit-tracker.ts`**
  - [ ] `ProfitTracker`:
    - `recordAttempt(intentId, pricing) → Store expected`
    - `recordResult(intentId, success, gasUsed) → net profit = fee + slippage - gas`
    - `getStats(period?) → { totalProfit, successCount, failCount, avgProfit, roi }`
    - `getROI() → Annualized ROI`

- [ ] **Create `src/solver/monitoring/health-checker.ts`**
  - [ ] `HealthChecker`: check() → Test RPC, contracts, mempool, inventory levels
  - [ ] `isHealthy() → false if any critical check fails`

- [ ] **Create `src/solver/monitoring/alert-manager.ts`**
  - [ ] `AlertManager`: alert(level, message), alertLowInventory(...), alertFailedClaim(...)

- [ ] **Create `tests/solver/monitoring.test.ts`**
  - [ ] Test: profit calc, ROI, health check detects failure

---

## Stage 2 Phase I: Protocols for Rebalancing (Week 7)

- [ ] **Create `src/solver/protocols/base-protocol.ts`**
  - [ ] `BaseProtocol abstract`: name, type, supportedChains, abstract quote(), buildTransaction(), shared supports(chainId)

- [ ] **Create `src/solver/protocols/protocol-registry.ts`**
  - [ ] `ProtocolRegistry`: register(), get(), getBestBridge(fromChain, toChain)

- [ ] **Create `src/solver/protocols/aggregators/swing.ts`**
  - [ ] `SwingProtocol extends BaseProtocol`: Constructor (apiKey)
    - `quote(params) → Promise<ProtocolQuote>`: GET /v0/quote, parse outputAmount, fees, time
    - `buildTransaction(quote) → Promise<Transaction>`: POST /v0/transfer, return {to, data, value, gas}
    - `getTransferStatus(transferId) → Promise<'pending'|'done'|'failed'>`: GET /v0/transfer/status/{id}

- [ ] **Create `src/solver/protocols/lending/aave.ts`**
  - [ ] `AaveProtocol extends BaseProtocol`
    - `getAPY(token, chainId) → Promise<number>`: Query getReserveData, convert ray to APY
    - `deposit(token, amount, chainId) → Promise<Transaction>`: Build approve + supply calls
    - `withdraw(token, amount, chainId) → Promise<Transaction>`: Build withdraw call

- [ ] **Create `tests/solver/protocols.test.ts`**
  - [ ] Test: Swing quote, buildTx, Aave APY, registry getBestBridge

---

## Stage 2 Phase J: ERC-8004 Registration (Week 7)

- [ ] **Create `src/solver/contracts/agent-registry/erc-8004.ts`**
  - [ ] `AgentRegistryContract(contractAddress, wallet)`
    - `register(config) → Promise<ExecutionResult>`: Call registerAgent(name, capabilities, endpoint)
    - `updateReputation(address, success) → Promise<void>`: Call on-chain
    - `getAgent(address) → Promise<AgentInfo>`: View mapping call

---

## Stage 2 Phase K: Main Export & Examples (Week 8)

- [ ] **Create `src/solver/index.ts`**
  - [ ] `IntentSolver class`: clean wrapper around LiquidityAgent
    - solve(intent), getQuote(intent), start(mempoolUrl?), stop(), getStatus(), getStats()

- [ ] **Update `src/index.ts`**
  - [ ] Export IntentParser, IntentSolver, all key types
  - [ ] Export createIntentSDK(config) factory: returns { parser, solver }

- [ ] **Create `examples/basic-bridge.ts`**
  - [ ] Parse → getQuote → solve (simulate) → show fee breakdown

- [ ] **Create `examples/autonomous-agent.ts`**
  - [ ] Initialize solver → start() → show mempool monitoring + profit output

- [ ] **Create `examples/inventory-management.ts`**
  - [ ] Check balances, trigger rebalance, view profit stats

---

## Stage 2 Phase L: Integration Tests & Docs (Week 8-9)

- [ ] **Create `tests/integration/full-bridge-flow.test.ts`**
  - [ ] Full flow: parse → solve → settle (mock chains)
  - [ ] Fee correct, inventory updated, rebalancing triggered

- [ ] **Create `tests/integration/edge-cases.test.ts`**
  - [ ] Expired deadline, insufficient inventory, failed claim, concurrent intents no double-spend

- [ ] **Create `docs/SOLVER.md`**: Architecture, concept, config guide, fee structure, API reference

- [ ] **Update `README.md`**: Solver section, quick start, chains table, economics