/**
 * IntentSolver — Phase K
 * 
 * Public-facing wrapper class that encapsulates all solver subsystems
 * into a single, easy-to-use interface.
 */

import { LiquidityAgent } from "./agent/liquidity-agent";
import { buildAgentConfig, type LiquidityAgentConfig } from "./agent/agent-config";
import { InventoryManager } from "./inventory/inventory-manager";
import { DynamicPricing } from "./pricing/dynamic-pricing";
import { SettlementManager } from "./settlement/settlement-manager";
import { ProofGenerator } from "./settlement/proof-generator";
import { ProofVerifier } from "./settlement/proof-verifier";
import { IntentSettlementContract } from "./contracts/intent-settlement/intent-settlement";
import { WalletManager } from "../shared/wallet-manager/wallet-manager";
import { RPCProviderManager } from "../shared/rpc/provider-manager";
import { ChainRegistry } from "../shared/chain-registry/registry";
import { SUPPORTED_CHAINS } from "../config/chains";
import { TokenRegistry } from "../shared/token-registry/registry";
import { MempoolMonitor } from "./mempool/mempool-monitor";
import { MempoolClient } from "./mempool/mempool-client";
import { IntentFilter } from "./mempool/intent-filter";
import { SolutionSubmitter } from "./mempool/solution-submitter";
import { ProfitTracker } from "./monitoring/profit-tracker";
import { createViemProviderFactory } from "../shared/rpc/viem-provider";

import { ethers } from "ethers";

import type { SolverIntent } from "./types/intent";
import type { SolutionResult } from "./types/agent";
import type { PricingResult } from "./types/pricing";
import type { Hash, ChainId, Address } from "../types/common";
import type { ChainConfig } from "../types/chain";

export class IntentSolver {
    public readonly config: LiquidityAgentConfig;

    // Core Subsystems exposed if advanced users need them
    public readonly chainRegistry: ChainRegistry;
    public readonly tokenRegistry: TokenRegistry;
    public readonly rpcProviderManager: RPCProviderManager;
    public readonly walletManager: WalletManager;
    public readonly inventoryManager: InventoryManager;
    public readonly dynamicPricing: DynamicPricing;
    public readonly proofGenerator: ProofGenerator;
    public readonly proofVerifier: ProofVerifier;
    public readonly settlementContract: IntentSettlementContract;
    public readonly settlementManager: SettlementManager;
    public readonly agent: LiquidityAgent;

    // Mempool & Monitoring
    public readonly mempoolClient: MempoolClient;
    public readonly intentFilter: IntentFilter;
    public readonly solutionSubmitter: SolutionSubmitter;
    public readonly profitTracker: ProfitTracker;
    public readonly mempoolMonitor: MempoolMonitor;

    constructor(userConfig: Partial<LiquidityAgentConfig> & { agent: { privateKey: string } }) {
        // Deep merge user config with SDK defaults
        this.config = buildAgentConfig(userConfig as any);

        // 1. Foundation layer
        this.chainRegistry = new ChainRegistry();
        this.chainRegistry.registerAll(SUPPORTED_CHAINS);
        this.tokenRegistry = new TokenRegistry();
        this.rpcProviderManager = new RPCProviderManager(createViemProviderFactory());

        const signerFactory = (privateKey: string, chainId: ChainId) => {
            // Provide a basic wrapper compatible with both ethers and our WalletSigner interface
            const wallet = new ethers.Wallet(privateKey);
            return {
                getAddress: () => wallet.address as Address,
                signMessage: async (msg: string) => wallet.signMessage(msg),
                signTypedData: async (domain: any, types: any, value: any) => wallet.signTypedData(domain, types, value)
            };
        };
        this.walletManager = new WalletManager(this.config.agent.privateKey, signerFactory);

        // 2. Inventory & Pricing
        this.inventoryManager = new InventoryManager(
            this.walletManager,
            this.tokenRegistry,
            this.chainRegistry,
            this.rpcProviderManager,
            this.config.inventory
        );
        this.dynamicPricing = new DynamicPricing(this.config.pricing, this.inventoryManager);

        // 3. Settlement
        // Create an adapter for IProviderForProof
        const providerForProof = {
            getTransactionReceipt: async (chainId: ChainId, txHash: Hash) => {
                const provider = this.rpcProviderManager.getProvider(chainId);
                return provider.getTransactionReceipt(txHash) as any;
            },
            getBlockNumber: async (chainId: ChainId) => {
                return this.rpcProviderManager.getProvider(chainId).getBlockNumber();
            }
        };

        // Use the primary chain signer as the proof signer
        const primaryChain = this.config.agent.supportedChains[0] || 1;
        const proofSigner = this.walletManager.getSigner(primaryChain);

        this.proofGenerator = new ProofGenerator(proofSigner, providerForProof);
        this.proofVerifier = new ProofVerifier();

        // Initialize the contract wrapper with ethers.Wallet for proper signing
        const settlementSigner = new ethers.Wallet(this.config.agent.privateKey);
        this.settlementContract = new IntentSettlementContract(
            this.config.contractAddress,
            settlementSigner
        );

        this.settlementManager = new SettlementManager(
            this.proofGenerator,
            this.proofVerifier,
            this.settlementContract,
            this.config.settlement
        );

        // 4. Core Agent Orchestrator
        this.agent = new LiquidityAgent(
            this.inventoryManager,
            this.dynamicPricing,
            this.settlementManager,
            this.walletManager,
            this.config
        );

        // 5. Monitoring
        this.profitTracker = new ProfitTracker();

        // 6. Mempool integration
        this.mempoolClient = new MempoolClient();
        this.intentFilter = new IntentFilter(this.agent);
        this.solutionSubmitter = new SolutionSubmitter(this.mempoolClient);
        this.mempoolMonitor = new MempoolMonitor(
            this.mempoolClient,
            this.intentFilter,
            this.agent,
            this.solutionSubmitter
        );
    }

    /**
     * Safely registers a custom chain and its tokens across all internal registries.
     * Call this instead of modifying `chainRegistry` directly if you want inventory tracking.
     */
    public registerCustomChain(config: ChainConfig, tokens: any[] = []) {
        this.chainRegistry.register(config);
        this.rpcProviderManager.registerChain(config);
        
        for (const t of tokens) {
            this.tokenRegistry.register(t);
        }
    }

    /**
     * Initialize non-blocking resources (e.g. fetch initial balances, derive address)
     * Must be called before `solve` or `start`.
     */
    async initialize(): Promise<void> {
        // Inject provider into settlement signer
        const primaryChain = this.config.agent.supportedChains[0] || 1;
        const config = this.chainRegistry.get(primaryChain);
        if (config && config.rpcUrl) {
            const provider = new ethers.JsonRpcProvider(config.rpcUrl);
            const connectedSigner = new ethers.Wallet(this.config.agent.privateKey, provider);
            this.settlementContract.updateSigner(connectedSigner);
        }

        await this.agent.initialize();
    }

    /**
     * Start the background mempool listener to automatically process intents
     */
    start(mempoolUrl: string): void {
        this.mempoolClient.connect(mempoolUrl);
        this.mempoolMonitor.start();
    }

    /**
     * Stop background processes and disconnect WebSockets
     */
    stop(): void {
        this.mempoolMonitor.stop();
        this.agent.stop();
    }

    /**
     * Get a quote for a bridge intent
     */
    getQuote(intent: SolverIntent): PricingResult {
        return this.agent.getQuote(intent);
    }

    /**
     * Check if the agent wants and can solve this intent
     */
    canSolve(intent: SolverIntent): boolean {
        return this.agent.canSolve(intent);
    }

    /**
     * Attempt to solve an intent directly (bypasses mempool listener)
     */
    async solve(intent: SolverIntent): Promise<SolutionResult> {
        // Track standalone solves as well
        if (this.canSolve(intent)) {
            const pricing = this.getQuote(intent);
            this.profitTracker.recordAttempt(intent.intentId, pricing);
        }
        const result = await this.agent.solve(intent);
        this.profitTracker.recordResult(
            intent.intentId,
            result.success,
            (result as any).gasUsed || "0"
        );
        return result;
    }

    /**
     * Check the current state of the agent
     */
    getStatus() {
        return this.agent.getStatus();
    }

    /**
     * Fetch profit and operational metrics
     */
    getStats() {
        return {
            profitStats: this.profitTracker.getStats(),
            mempoolStats: this.mempoolMonitor.getStats()
        };
    }
}
