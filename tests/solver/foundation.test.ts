/**
 * Foundation Tests — Stage 2 Phase A
 *
 * Tests untuk semua shared services dan core types.
 * Memastikan fondasi solid sebelum Phase B+.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ChainRegistry } from "../../src/shared/chain-registry/registry";
import { TokenRegistry, DEFAULT_TOKENS } from "../../src/shared/token-registry/registry";
import { WalletManager } from "../../src/shared/wallet-manager/wallet-manager";
import { RPCProviderManager } from "../../src/shared/rpc/provider-manager";
import { ETHEREUM_CONFIG, POLYGON_CONFIG, ARBITRUM_CONFIG, SUPPORTED_CHAINS } from "../../src/config/chains";
import { DEFAULT_PRICING_CONFIG, DEFAULT_INVENTORY_CONFIG, DEFAULT_AGENT_SETTINGS } from "../../src/config/default";
import { SolverError, InsufficientInventoryError, IntentExpiredError, UnsupportedIntentError } from "../../src/errors/solver-errors";
import { InventoryError, InventoryLockError, RebalancingFailedError } from "../../src/errors/inventory-errors";
import { SettlementError, ProofGenerationError, ClaimFailedError } from "../../src/errors/settlement-errors";

import type { Address, ChainId, Hash, Amount } from "../../src/types/common";
import type { ChainConfig } from "../../src/types/chain";
import type { TokenInfo } from "../../src/shared/token-registry/registry";
import type { AgentConfig, AgentStatus, SolutionResult } from "../../src/solver/types/agent";
import type { InventoryBalance, InventorySnapshot, RebalanceTask } from "../../src/solver/types/inventory";
import type { IntentStatus, SolverIntent, BridgeIntent } from "../../src/solver/types/intent";
import type { Settlement, CrossChainProof, SettlementStatus } from "../../src/solver/types/settlement";
import type { PricingResult, PricingConfig } from "../../src/solver/types/pricing";
import type { Transaction, ExecutionResult, MultiChainExecution } from "../../src/solver/types/execution";

// ─────────────────────────────────────────────
// Chain Registry Tests
// ─────────────────────────────────────────────

describe("ChainRegistry", () => {
    let registry: ChainRegistry;

    beforeEach(() => {
        registry = new ChainRegistry();
    });

    test("should register and retrieve a chain", () => {
        registry.register(ETHEREUM_CONFIG);

        const chain = registry.get(1);
        expect(chain.id).toBe(1);
        expect(chain.name).toBe("Ethereum");
        expect(chain.rpcUrl).toBeDefined();
        expect(chain.nativeCurrency.symbol).toBe("ETH");
    });

    test("should register multiple chains", () => {
        registry.registerAll(SUPPORTED_CHAINS);

        expect(registry.size).toBe(3);
        expect(registry.has(1)).toBe(true);    // ETH
        expect(registry.has(137)).toBe(true);  // Polygon
        expect(registry.has(42161)).toBe(true); // Arbitrum
    });

    test("should throw when registering duplicate chain", () => {
        registry.register(ETHEREUM_CONFIG);

        expect(() => registry.register(ETHEREUM_CONFIG)).toThrow(
            "Chain 1 (Ethereum) is already registered"
        );
    });

    test("should throw when getting unregistered chain", () => {
        expect(() => registry.get(999)).toThrow(
            "Chain Unknown Chain (999) is not registered"
        );
    });

    test("should list all registered chains", () => {
        registry.registerAll(SUPPORTED_CHAINS);

        const chains = registry.list();
        expect(chains).toHaveLength(3);

        const ids = registry.listIds();
        expect(ids).toContain(1);
        expect(ids).toContain(137);
        expect(ids).toContain(42161);
    });

    test("should have correct contract addresses", () => {
        registry.register(ETHEREUM_CONFIG);
        registry.register(POLYGON_CONFIG);

        const eth = registry.get(1);
        expect(eth.contracts.usdc).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

        const polygon = registry.get(137);
        expect(polygon.contracts.usdc).toBe("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
    });

    test("should have fallback RPC URLs", () => {
        registry.register(ETHEREUM_CONFIG);

        const eth = registry.get(1);
        expect(eth.fallbackRpcUrls.length).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────
// Token Registry Tests
// ─────────────────────────────────────────────

describe("TokenRegistry", () => {
    let registry: TokenRegistry;

    beforeEach(() => {
        registry = new TokenRegistry();
    });

    test("should register and retrieve token by symbol", () => {
        const usdc: TokenInfo = {
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
            symbol: "USDC",
            decimals: 6,
            chainId: 1,
            name: "USD Coin",
        };

        registry.register(usdc);

        const result = registry.get("USDC", 1);
        expect(result).toBeDefined();
        expect(result!.symbol).toBe("USDC");
        expect(result!.decimals).toBe(6);
        expect(result!.chainId).toBe(1);
    });

    test("should retrieve token by address", () => {
        const usdc: TokenInfo = {
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
            symbol: "USDC",
            decimals: 6,
            chainId: 1,
            name: "USD Coin",
        };

        registry.register(usdc);

        const result = registry.getByAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 1);
        expect(result).toBeDefined();
        expect(result!.symbol).toBe("USDC");
    });

    test("should be case-insensitive for symbol lookup", () => {
        registry.registerAll(DEFAULT_TOKENS);

        expect(registry.get("usdc", 1)).toBeDefined();
        expect(registry.get("USDC", 1)).toBeDefined();
        expect(registry.get("Usdc", 1)).toBeDefined();
    });

    test("should be case-insensitive for address lookup", () => {
        registry.registerAll(DEFAULT_TOKENS);

        const upper = registry.getByAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 1);
        const lower = registry.getByAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 1);
        expect(upper).toBeDefined();
        expect(lower).toBeDefined();
        expect(upper!.symbol).toBe(lower!.symbol);
    });

    test("should distinguish same token on different chains", () => {
        registry.registerAll(DEFAULT_TOKENS);

        const usdcEth = registry.get("USDC", 1);
        const usdcPolygon = registry.get("USDC", 137);

        expect(usdcEth).toBeDefined();
        expect(usdcPolygon).toBeDefined();
        expect(usdcEth!.address).not.toBe(usdcPolygon!.address);
        expect(usdcEth!.chainId).toBe(1);
        expect(usdcPolygon!.chainId).toBe(137);
    });

    test("should return undefined for unknown token", () => {
        expect(registry.get("UNKNOWN", 1)).toBeUndefined();
        expect(registry.getByAddress("0x0000000000000000000000000000000000000000", 1)).toBeUndefined();
    });

    test("should register default tokens", () => {
        registry.registerAll(DEFAULT_TOKENS);

        expect(registry.size).toBe(3); // USDC on ETH, Polygon, Arbitrum

        expect(registry.has("USDC", 1)).toBe(true);
        expect(registry.has("USDC", 137)).toBe(true);
        expect(registry.has("USDC", 42161)).toBe(true);
    });

    test("should list tokens by chain", () => {
        registry.registerAll(DEFAULT_TOKENS);

        const ethTokens = registry.listByChain(1);
        expect(ethTokens).toHaveLength(1);
        expect(ethTokens[0].symbol).toBe("USDC");

        const allTokens = registry.listAll();
        expect(allTokens).toHaveLength(3);
    });
});

// ─────────────────────────────────────────────
// Wallet Manager Tests
// ─────────────────────────────────────────────

describe("WalletManager", () => {
    test("should validate private key format", () => {
        expect(() => new WalletManager("invalid")).toThrow(
            "Private key must be a hex string starting with 0x"
        );

        expect(() => new WalletManager("")).toThrow();
    });

    test("should accept valid private key", () => {
        const wallet = new WalletManager("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
        expect(wallet.getPrivateKey()).toBe("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    });

    test("should require signer factory for getAddress", () => {
        const wallet = new WalletManager("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

        expect(() => wallet.getAddress()).toThrow("signerFactory");
    });

    test("should use signer factory when provided", () => {
        const mockAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

        const mockSignerFactory = (_pk: string, _chainId: ChainId) => ({
            getAddress: () => mockAddress,
            signMessage: async (_msg: string) => "0xmocksignature",
        });

        const wallet = new WalletManager(
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            mockSignerFactory,
        );

        expect(wallet.getAddress()).toBe(mockAddress);
    });

    test("should sign message via signer factory", async () => {
        const mockSignature = "0xsigned_message_123";

        const mockSignerFactory = (_pk: string, _chainId: ChainId) => ({
            getAddress: () => "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
            signMessage: async (_msg: string) => mockSignature,
        });

        const wallet = new WalletManager(
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            mockSignerFactory,
        );

        const result = await wallet.signMessage("hello");
        expect(result).toBe(mockSignature);
    });

    test("should require signer factory for signMessage", async () => {
        const wallet = new WalletManager("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

        expect(wallet.signMessage("hello")).rejects.toThrow("signerFactory");
    });
});

// ─────────────────────────────────────────────
// RPC Provider Manager Tests
// ─────────────────────────────────────────────

describe("RPCProviderManager", () => {
    test("should register chains and track them", () => {
        const manager = new RPCProviderManager();
        manager.registerChains(SUPPORTED_CHAINS);

        // Without a factory, getProvider should throw
        expect(() => manager.getProvider(1)).toThrow("providerFactory");
    });

    test("should throw for unregistered chain", () => {
        const manager = new RPCProviderManager();

        expect(() => manager.getProvider(999)).toThrow("Chain Unknown Chain (999) is not registered");
    });

    test("should create and cache providers", () => {
        let createCount = 0;

        const mockFactory = (config: ChainConfig) => {
            createCount++;
            return {
                chainId: config.id,
                call: async () => "0x",
                getBlockNumber: async () => 12345,
                getTransactionReceipt: async () => null,
                getGasPrice: async () => "20000000000",
                isHealthy: async () => true,
            };
        };

        const manager = new RPCProviderManager(mockFactory);
        manager.registerChains(SUPPORTED_CHAINS);

        // First call creates provider
        const provider1 = manager.getProvider(1);
        expect(createCount).toBe(1);

        // Second call returns cached
        const provider2 = manager.getProvider(1);
        expect(createCount).toBe(1);
        expect(provider1).toBe(provider2);

        // Different chain creates new provider
        manager.getProvider(137);
        expect(createCount).toBe(2);
    });

    test("should get token balance", async () => {
        const mockFactory = (config: ChainConfig) => ({
            chainId: config.id,
            call: async (_to: Address, _data: string) => {
                // Return 1000 * 10^6 = 1,000,000,000 (1000 USDC)
                return "0x000000000000000000000000000000000000000000000000000000003b9aca00";
            },
            getBlockNumber: async () => 12345,
            getTransactionReceipt: async () => null,
            getGasPrice: async () => "20000000000",
            isHealthy: async () => true,
        });

        const manager = new RPCProviderManager(mockFactory);
        manager.registerChains(SUPPORTED_CHAINS);

        const balance = await manager.getTokenBalance(
            1,
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        );

        expect(balance).toBe(1_000_000_000n); // 1000 USDC
    });

    test("should return 0 for empty balance", async () => {
        const mockFactory = (config: ChainConfig) => ({
            chainId: config.id,
            call: async () => "0x0",
            getBlockNumber: async () => 12345,
            getTransactionReceipt: async () => null,
            getGasPrice: async () => "20000000000",
            isHealthy: async () => true,
        });

        const manager = new RPCProviderManager(mockFactory);
        manager.registerChains(SUPPORTED_CHAINS);

        const balance = await manager.getTokenBalance(
            1,
            "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
            "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        );

        expect(balance).toBe(0n);
    });

    test("should check health across all chains", async () => {
        const mockFactory = (config: ChainConfig) => ({
            chainId: config.id,
            call: async () => "0x",
            getBlockNumber: async () => 12345,
            getTransactionReceipt: async () => null,
            getGasPrice: async () => "20000000000",
            isHealthy: async () => config.id !== 42161, // Arbitrum unhealthy
        });

        const manager = new RPCProviderManager(mockFactory);
        manager.registerChains(SUPPORTED_CHAINS);

        const health = await manager.checkHealth();
        expect(health.get(1)).toBe(true);
        expect(health.get(137)).toBe(true);
        expect(health.get(42161)).toBe(false);
    });

    test("should clear providers cache", () => {
        let createCount = 0;

        const mockFactory = (config: ChainConfig) => {
            createCount++;
            return {
                chainId: config.id,
                call: async () => "0x",
                getBlockNumber: async () => 12345,
                getTransactionReceipt: async () => null,
                getGasPrice: async () => "20000000000",
                isHealthy: async () => true,
            };
        };

        const manager = new RPCProviderManager(mockFactory);
        manager.registerChains(SUPPORTED_CHAINS);

        manager.getProvider(1);
        expect(createCount).toBe(1);

        manager.clearProviders();

        manager.getProvider(1);
        expect(createCount).toBe(2); // Recreated after clear
    });
});

// ─────────────────────────────────────────────
// Error Classes Tests
// ─────────────────────────────────────────────

describe("Error Classes", () => {
    describe("Solver Errors", () => {
        test("SolverError - base error", () => {
            const err = new SolverError("something failed", "CUSTOM_CODE");
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(SolverError);
            expect(err.message).toBe("something failed");
            expect(err.code).toBe("CUSTOM_CODE");
            expect(err.name).toBe("SolverError");
        });

        test("InsufficientInventoryError", () => {
            const err = new InsufficientInventoryError(137, "USDC", "1000000000", "500000000");
            expect(err).toBeInstanceOf(SolverError);
            expect(err.code).toBe("INSUFFICIENT_INVENTORY");
            expect(err.chainId).toBe(137);
            expect(err.token).toBe("USDC");
            expect(err.required).toBe("1000000000");
            expect(err.available).toBe("500000000");
            expect(err.message).toContain("Insufficient USDC");
            expect(err.message).toContain("Polygon (137)");
        });

        test("IntentExpiredError", () => {
            const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
            const err = new IntentExpiredError("intent-123", deadline);
            expect(err).toBeInstanceOf(SolverError);
            expect(err.code).toBe("INTENT_EXPIRED");
            expect(err.intentId).toBe("intent-123");
            expect(err.deadline).toBe(deadline);
            expect(err.message).toContain("intent-123");
        });

        test("UnsupportedIntentError", () => {
            const err = new UnsupportedIntentError("nft_purchase", "NFT intents not supported");
            expect(err).toBeInstanceOf(SolverError);
            expect(err.code).toBe("UNSUPPORTED_INTENT");
            expect(err.intentType).toBe("nft_purchase");
            expect(err.reason).toBe("NFT intents not supported");
        });
    });

    describe("Inventory Errors", () => {
        test("InventoryError - base error", () => {
            const err = new InventoryError("inventory issue");
            expect(err).toBeInstanceOf(Error);
            expect(err.code).toBe("INVENTORY_ERROR");
        });

        test("InventoryLockError", () => {
            const err = new InventoryLockError("intent-456");
            expect(err).toBeInstanceOf(InventoryError);
            expect(err.code).toBe("INVENTORY_LOCK_FAILED");
            expect(err.intentId).toBe("intent-456");
        });

        test("RebalancingFailedError", () => {
            const err = new RebalancingFailedError(1, 137, "50000000000", "Bridge tx reverted");
            expect(err).toBeInstanceOf(InventoryError);
            expect(err.code).toBe("REBALANCING_FAILED");
            expect(err.fromChain).toBe(1);
            expect(err.toChain).toBe(137);
            expect(err.amount).toBe("50000000000");
            expect(err.reason).toBe("Bridge tx reverted");
        });
    });

    describe("Settlement Errors", () => {
        test("SettlementError - base error", () => {
            const err = new SettlementError("settlement issue");
            expect(err).toBeInstanceOf(Error);
            expect(err.code).toBe("SETTLEMENT_ERROR");
        });

        test("ProofGenerationError", () => {
            const err = new ProofGenerationError("Cannot sign proof data");
            expect(err).toBeInstanceOf(SettlementError);
            expect(err.code).toBe("PROOF_GENERATION_FAILED");
        });

        test("ClaimFailedError", () => {
            const err = new ClaimFailedError("intent-789", "Contract reverted: invalid proof");
            expect(err).toBeInstanceOf(SettlementError);
            expect(err.code).toBe("CLAIM_FAILED");
            expect(err.intentId).toBe("intent-789");
            expect(err.reason).toBe("Contract reverted: invalid proof");
        });
    });
});

// ─────────────────────────────────────────────
// Config Defaults Tests
// ─────────────────────────────────────────────

describe("Default Configs", () => {
    test("DEFAULT_PRICING_CONFIG has correct values", () => {
        expect(DEFAULT_PRICING_CONFIG.baseFeePercent).toBe(0.005);
        expect(DEFAULT_PRICING_CONFIG.minFeeUSD).toBe(1);
        expect(DEFAULT_PRICING_CONFIG.maxFeePercent).toBe(0.03);
        expect(DEFAULT_PRICING_CONFIG.slippageSharePercent).toBe(0.5);
    });

    test("DEFAULT_INVENTORY_CONFIG has correct values", () => {
        expect(DEFAULT_INVENTORY_CONFIG.minReservePercent).toBe(0.1);
        expect(DEFAULT_INVENTORY_CONFIG.rebalanceThreshold).toBe(0.15);
        expect(DEFAULT_INVENTORY_CONFIG.pollingIntervalMs).toBe(30_000);
    });

    test("DEFAULT_AGENT_SETTINGS has correct values", () => {
        expect(DEFAULT_AGENT_SETTINGS.mode).toBe("simulate");
        expect(DEFAULT_AGENT_SETTINGS.maxConcurrentIntents).toBe(5);
        expect(DEFAULT_AGENT_SETTINGS.intentTimeout).toBe(3600);
    });
});

// ─────────────────────────────────────────────
// Type Safety Tests (compile-time checks)
// ─────────────────────────────────────────────

describe("Type Safety", () => {
    test("Address type works correctly", () => {
        const addr: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        expect(addr.startsWith("0x")).toBe(true);
    });

    test("Hash type works correctly", () => {
        const hash: Hash = "0xabc123def456789012345678901234567890123456789012345678901234abcd";
        expect(hash.startsWith("0x")).toBe(true);
    });

    test("AgentConfig can be created", () => {
        const config: AgentConfig = {
            name: "TestBot",
            privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            supportedChains: [1, 137],
            supportedTokens: ["USDC"],
            mode: "simulate",
        };

        expect(config.name).toBe("TestBot");
        expect(config.supportedChains).toContain(1);
        expect(config.mode).toBe("simulate");
    });

    test("InventoryBalance tracks chain balances", () => {
        const balance: InventoryBalance = {
            chainId: 137,
            token: "USDC",
            available: 1_000_000_000n, // 1000 USDC
            locked: 100_000_000n,     // 100 USDC
            lastUpdated: Date.now(),
        };

        expect(balance.available - balance.locked).toBe(900_000_000n);
    });

    test("PricingResult fee breakdown is consistent", () => {
        const pricing: PricingResult = {
            baseFee: "5000000",
            gasCost: "500000",
            slippageCapture: "2500000",
            totalFee: "8000000",
            userPays: "1000000000",
            userReceives: "992000000",
            solverProfit: "7500000",
        };

        // totalFee = baseFee + gasCost + slippageCapture
        const computed = BigInt(pricing.baseFee) + BigInt(pricing.gasCost) + BigInt(pricing.slippageCapture);
        expect(computed).toBe(BigInt(pricing.totalFee));

        // solverProfit = totalFee - gasCost
        const profit = BigInt(pricing.totalFee) - BigInt(pricing.gasCost);
        expect(profit).toBe(BigInt(pricing.solverProfit));
    });

    test("IntentStatus type has all expected values", () => {
        const statuses: IntentStatus[] = [
            "pending", "matched", "fulfilling", "fulfilled", "failed", "refunded"
        ];
        expect(statuses).toHaveLength(6);
    });

    test("AgentStatus type has all expected values", () => {
        const statuses: AgentStatus[] = ["idle", "processing", "rebalancing", "error"];
        expect(statuses).toHaveLength(4);
    });

    test("Settlement type can be constructed", () => {
        const settlement: Settlement = {
            intentId: "intent-001",
            solver: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
            targetTx: "0xabc123" as Hash,
            status: "pending",
            startedAt: Date.now(),
            claimAttempts: 0,
        };

        expect(settlement.status).toBe("pending");
        expect(settlement.claimAttempts).toBe(0);
    });

    test("Transaction type can be constructed", () => {
        const tx: Transaction = {
            to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
            data: "0x",
            value: "0",
            gasLimit: "100000",
            chainId: 1,
        };

        expect(tx.chainId).toBe(1);
        expect(tx.value).toBe("0");
    });
});

// ─────────────────────────────────────────────
// Chain Config Tests
// ─────────────────────────────────────────────

describe("Chain Configs", () => {
    test("ETHEREUM_CONFIG is valid", () => {
        expect(ETHEREUM_CONFIG.id).toBe(1);
        expect(ETHEREUM_CONFIG.name).toBe("Ethereum");
        expect(ETHEREUM_CONFIG.nativeCurrency.symbol).toBe("ETH");
        expect(ETHEREUM_CONFIG.contracts.usdc).toBeDefined();
        expect(ETHEREUM_CONFIG.blockTimeSeconds).toBe(12);
        expect(ETHEREUM_CONFIG.confirmations).toBe(12);
    });

    test("POLYGON_CONFIG is valid", () => {
        expect(POLYGON_CONFIG.id).toBe(137);
        expect(POLYGON_CONFIG.name).toBe("Polygon");
        expect(POLYGON_CONFIG.nativeCurrency.symbol).toBe("POL");
        expect(POLYGON_CONFIG.contracts.usdc).toBeDefined();
        expect(POLYGON_CONFIG.blockTimeSeconds).toBe(2);
    });

    test("ARBITRUM_CONFIG is valid", () => {
        expect(ARBITRUM_CONFIG.id).toBe(42161);
        expect(ARBITRUM_CONFIG.name).toBe("Arbitrum One");
        expect(ARBITRUM_CONFIG.nativeCurrency.symbol).toBe("ETH");
        expect(ARBITRUM_CONFIG.contracts.usdc).toBeDefined();
    });

    test("SUPPORTED_CHAINS contains all 3 chains", () => {
        expect(SUPPORTED_CHAINS).toHaveLength(3);
        const ids = SUPPORTED_CHAINS.map(c => c.id);
        expect(ids).toContain(1);
        expect(ids).toContain(137);
        expect(ids).toContain(42161);
    });
});
