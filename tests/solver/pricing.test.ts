/**
 * Pricing Tests — Stage 2 Phase C
 *
 * Comprehensive tests for FeeCalculator, SlippageCapture, and DynamicPricing.
 *
 * Run: bun test tests/solver/pricing.test.ts
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { FeeCalculator } from "../../src/solver/pricing/fee-calculator";
import { SlippageCapture } from "../../src/solver/pricing/slippage-capture";
import { DynamicPricing } from "../../src/solver/pricing/dynamic-pricing";
import { DEFAULT_PRICING_CONFIG } from "../../src/config/default";
import { InventoryManager } from "../../src/solver/inventory/inventory-manager";
import { ChainRegistry } from "../../src/shared/chain-registry/registry";
import { TokenRegistry, DEFAULT_TOKENS } from "../../src/shared/token-registry/registry";
import { ETHEREUM_CONFIG, POLYGON_CONFIG } from "../../src/config/chains";

import type { PricingConfig } from "../../src/solver/types/pricing";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { Address, ChainId } from "../../src/types/common";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const USDC = 1_000_000n; // 1 USDC = 1_000_000 (6 decimals)
const AGENT_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

// ─────────────────────────────────────────────
// Mock Factories
// ─────────────────────────────────────────────

function mockWalletManager() {
    return {
        getAddress: () => AGENT_ADDRESS,
        getPrivateKey: () => "0xdeadbeef",
        signMessage: async (_msg: string) => "0xsig",
        getSigner: () => ({
            getAddress: () => AGENT_ADDRESS,
            signMessage: async (_msg: string) => "0xsig",
        }),
    };
}

/** Mock provider returning configurable balances per chain */
function mockProviderManager(balanceByChain: Record<number, bigint> = {}) {
    return {
        getTokenBalance: async (chainId: ChainId, _token: Address, _wallet: Address) => {
            return balanceByChain[chainId] ?? 0n;
        },
        getProvider: () => ({}),
        registerChain: () => { },
        registerChains: () => { },
        clearProviders: () => { },
        checkHealth: async () => new Map(),
    };
}

/** Build InventoryManager with specific balances pre-loaded */
async function buildInventoryManager(balanceByChain: Record<number, bigint>): Promise<InventoryManager> {
    const chainRegistry = new ChainRegistry();
    chainRegistry.registerAll([ETHEREUM_CONFIG, POLYGON_CONFIG]);

    const tokenRegistry = new TokenRegistry();
    tokenRegistry.registerAll(DEFAULT_TOKENS);

    const manager = new InventoryManager(
        mockWalletManager() as any,
        tokenRegistry,
        chainRegistry,
        mockProviderManager(balanceByChain) as any,
        { minReservePercent: 0.1 },
    );

    await manager.loadBalances();
    return manager;
}

/** Build a minimal SolverIntent for bridge 1000 USDC ETH→Polygon */
function buildBridgeIntent(overrides: Partial<{
    amount: string;
    sourceChain: number;
    targetChain: number;
    maxSlippage: number;
}> = {}): SolverIntent {
    return {
        intentId: "test-intent-1",
        intentHash: "0xhash" as any,
        user: AGENT_ADDRESS,
        signature: "0xsig",
        deadline: Math.floor(Date.now() / 1000) + 3600,
        status: "pending",
        receivedAt: Date.now(),
        parsedIntent: {
            intentType: "bridge",
            parameters: {
                inputToken: "USDC",
                inputAmount: overrides.amount ?? (1000n * USDC).toString(),
                sourceChain: String(overrides.sourceChain ?? 1),
                targetChain: String(overrides.targetChain ?? 137),
                recipient: AGENT_ADDRESS,
            },
            constraints: {
                maxSlippage: overrides.maxSlippage ?? 100, // 1% default
            },
        } as any,
    };
}

// ─────────────────────────────────────────────
// FeeCalculator Tests
// ─────────────────────────────────────────────

describe("FeeCalculator", () => {
    let calculator: FeeCalculator;

    beforeEach(() => {
        calculator = new FeeCalculator(DEFAULT_PRICING_CONFIG);
    });

    describe("calculateBaseFee()", () => {
        test("fee should be 5 USDC for 1000 USDC (0.5% baseFee)", () => {
            // TODO: Implement then verify:
            //   DEFAULT_PRICING_CONFIG.baseFeePercent = 0.005
            //   amount = 1000 USDC = 1_000 * USDC
            //   expected = 5 USDC = 5 * USDC = 5_000_000n
            const amount = 1000n * USDC;
            const fee = calculator.calculateBaseFee(amount);
            expect(fee).toBe(5n * USDC);
        });

        test("fee should respect minFeeUSD for tiny amounts", () => {
            // TODO: Verify small amounts trigger the minFeeUSD floor
            //   10 USDC × 0.5% = 0.05 USDC, but minFeeUSD = $1
            //   Expected: 1 USDC = 1_000_000n
            const tinyAmount = 10n * USDC;
            const fee = calculator.calculateBaseFee(tinyAmount);
            expect(fee).toBeGreaterThanOrEqual(1n * USDC);
        });

        test("fee should be capped at maxFeePercent for large amounts", () => {
            // TODO: Verify huge amounts don't exceed maxFeePercent cap
            //   DEFAULT maxFeePercent = 0.03 (3%)
            //   1_000_000 USDC × 0.5% = 5000 USDC. Cap is 3% = 30_000 USDC
            //   So for huge amounts, check cap is applied consistently
            const hugeAmount = 1_000_000n * USDC;
            const fee = calculator.calculateBaseFee(hugeAmount);
            const maxFee = (hugeAmount * BigInt(Math.floor(DEFAULT_PRICING_CONFIG.maxFeePercent * 10000))) / 10000n;
            expect(fee).toBeLessThanOrEqual(maxFee);
        });
    });

    describe("estimateGasCost()", () => {
        test("ETH mainnet should have higher gas cost than L2", () => {
            // ETH ↔ Polygon involves mainnet → expensive ($3)
            // Polygon ↔ Arbitrum is L2 only → cheap ($1)
            const ethGas = calculator.estimateGasCost(1 as ChainId, 137 as ChainId);
            const l2Gas = calculator.estimateGasCost(137 as ChainId, 42161 as ChainId);
            expect(ethGas).toBeGreaterThan(l2Gas);
        });

        test("single-chain gas should be lower than cross-chain", () => {
            // Same-chain (1→1) should be cheaper than cross-chain (1→137)
            const singleChainGas = calculator.estimateGasCost(1 as ChainId, 1 as ChainId);
            const crossChainGas = calculator.estimateGasCost(1 as ChainId, 137 as ChainId);
            expect(singleChainGas).toBeLessThan(crossChainGas);
        });
    });

    describe("isWorthSolving()", () => {
        test("should return true for large amounts (fee > gas cost)", () => {
            // TODO: 1000 USDC should be worth solving
            expect(calculator.isWorthSolving(1000n * USDC, 1 as ChainId, 137 as ChainId)).toBe(true);
        });

        test("should return false for tiny amounts (gas > base fee)", () => {
            // TODO: 1 USDC bridge is not worth solving — gas eats all profit
            expect(calculator.isWorthSolving(1n * USDC, 1 as ChainId, 137 as ChainId)).toBe(false);
        });
    });

    describe("calculate()", () => {
        test("should produce complete PricingResult with all fields", () => {
            // TODO: Full pricing breakdown for 1000 USDC ETH→Polygon, 1% max slippage
            const result = calculator.calculate({
                amount: 1000n * USDC,
                sourceChain: 1 as ChainId,
                targetChain: 137 as ChainId,
                token: "USDC",
                maxSlippageBps: 100,
            });

            // All required fields must be present
            expect(result.baseFee).toBeDefined();
            expect(result.gasCost).toBeDefined();
            expect(result.slippageCapture).toBeDefined();
            expect(result.totalFee).toBeDefined();
            expect(result.userPays).toBeDefined();
            expect(result.userReceives).toBeDefined();
            expect(result.solverProfit).toBeDefined();

            // Sanity: userReceives < userPays (fees are deducted)
            expect(BigInt(result.userReceives)).toBeLessThan(BigInt(result.userPays));
        });
    });
});

// ─────────────────────────────────────────────
// SlippageCapture Tests
// ─────────────────────────────────────────────

describe("SlippageCapture", () => {
    let slippage: SlippageCapture;

    beforeEach(() => {
        slippage = new SlippageCapture(DEFAULT_PRICING_CONFIG);
    });

    describe("calculate()", () => {
        test("should capture 50% of user 1% max slippage on 1000 USDC → 5 USDC", () => {
            // TODO: 1000 USDC × 1% × 50% share = 5 USDC
            //   DEFAULT slippageSharePercent = 0.5
            const capture = slippage.calculate(1000n * USDC, 100); // 100 bps = 1%
            expect(capture).toBe(5n * USDC);
        });

        test("should return 0 for 0 maxSlippageBps", () => {
            // TODO: User allows no slippage → nothing to capture
            const capture = slippage.calculate(1000n * USDC, 0);
            expect(capture).toBe(0n);
        });

        test("should scale linearly with amount", () => {
            // TODO: Doubling amount should double capture
            const captureLow = slippage.calculate(1000n * USDC, 100);
            const captureHigh = slippage.calculate(2000n * USDC, 100);
            expect(captureHigh).toBe(captureLow * 2n);
        });
    });

    describe("getEffectiveUserOutput()", () => {
        test("should return amount minus capture", () => {
            // TODO: 1000 USDC - 5 USDC capture = 995 USDC
            const capture = 5n * USDC;
            const output = slippage.getEffectiveUserOutput(1000n * USDC, capture);
            expect(output).toBe(995n * USDC);
        });

        test("should clamp to 0 if capture exceeds amount", () => {
            // TODO: Should never go negative
            const output = slippage.getEffectiveUserOutput(5n * USDC, 10n * USDC);
            expect(output).toBe(0n);
        });
    });
});

// ─────────────────────────────────────────────
// DynamicPricing Tests
// ─────────────────────────────────────────────

describe("DynamicPricing", () => {
    describe("getInventoryMultiplier()", () => {
        test("should return 0.8x (aggressive) when chain has >= 80% of total", async () => {
            // ETH: 8000, Polygon: 2000. ETH capacity = 80%.
            // TODO: Multiplier for ETH should be 0.8
            const manager = await buildInventoryManager({ 1: 8000n * USDC, 137: 2000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const multiplier = pricing.getInventoryMultiplier(1 as ChainId, 1000n * USDC);
            expect(multiplier).toBe(0.8);
        });

        test("should return 1.0x (normal) when chain has 50-79% of total", async () => {
            // ETH: 6000, Polygon: 4000. ETH capacity = 60%.
            const manager = await buildInventoryManager({ 1: 6000n * USDC, 137: 4000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const multiplier = pricing.getInventoryMultiplier(1 as ChainId, 1000n * USDC);
            expect(multiplier).toBe(1.0);
        });

        test("should return 1.5x (low) when chain has 20-49% of total", async () => {
            // ETH: 3000, Polygon: 7000. ETH capacity = 30%.
            const manager = await buildInventoryManager({ 1: 3000n * USDC, 137: 7000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const multiplier = pricing.getInventoryMultiplier(1 as ChainId, 1000n * USDC);
            expect(multiplier).toBe(1.5);
        });

        test("should return 2.0x (critical) when chain has < 20% of total", async () => {
            // ETH: 1000, Polygon: 9000. ETH capacity = 10%.
            const manager = await buildInventoryManager({ 1: 1000n * USDC, 137: 9000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const multiplier = pricing.getInventoryMultiplier(1 as ChainId, 1000n * USDC);
            expect(multiplier).toBe(2.0);
        });

        test("should return 2.0x when total inventory is 0", async () => {
            // No inventory at all → critical
            const manager = await buildInventoryManager({ 1: 0n, 137: 0n });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const multiplier = pricing.getInventoryMultiplier(1 as ChainId, 0n);
            expect(multiplier).toBe(2.0);
        });
    });

    describe("shouldReject()", () => {
        test("should return false for healthy inventory", async () => {
            // ETH: 5000, Polygon: 5000 → healthy
            const manager = await buildInventoryManager({ 1: 5000n * USDC, 137: 5000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const reject = pricing.shouldReject(1 as ChainId, 100n * USDC);
            expect(reject).toBe(false);
        });

        test("should return true when canFulfill returns false", async () => {
            // ETH: 10 USDC, trying to send 500 USDC → obvious reject
            const manager = await buildInventoryManager({ 1: 10n * USDC, 137: 5000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const reject = pricing.shouldReject(1 as ChainId, 500n * USDC);
            expect(reject).toBe(true);
        });

        test("should return true when chain capacity < 5% (critical floor)", async () => {
            // ETH: 50, total: 10050. ETH capacity = 0.5% — under critical floor 5%
            const manager = await buildInventoryManager({ 1: 50n * USDC, 137: 10_000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            // Even a tiny request should be rejected
            const reject = pricing.shouldReject(1 as ChainId, 1n * USDC);
            expect(reject).toBe(true);
        });
    });

    describe("getPrice()", () => {
        test("should apply inventory multiplier to baseFee", async () => {
            // Scenario A: Target Chain (137) has HIGH inventory (9000/10000 = 90%)
            // Expectation: Surplus → Multiplier 0.8x → Lower Fee
            const managerSurplus = await buildInventoryManager({ 1: 1000n * USDC, 137: 9000n * USDC });
            const pricingSurplus = new DynamicPricing(DEFAULT_PRICING_CONFIG, managerSurplus);
            const resultSurplus = pricingSurplus.getPrice(buildBridgeIntent());

            // Scenario B: Target Chain (137) has LOW inventory (1000/10000 = 10%)
            // Expectation: Scarcity → Multiplier 2.0x → Higher Fee
            const managerScarcity = await buildInventoryManager({ 1: 9000n * USDC, 137: 1000n * USDC });
            const pricingScarcity = new DynamicPricing(DEFAULT_PRICING_CONFIG, managerScarcity);
            const resultScarcity = pricingScarcity.getPrice(buildBridgeIntent());

            // Scarcity case should be MORE EXPENSIVE than Surplus case
            expect(BigInt(resultScarcity.totalFee)).toBeGreaterThan(BigInt(resultSurplus.totalFee));
        });

        test("should produce valid PricingResult structure", async () => {
            // 50/50 inventory → 1.0x multiplier (normal)
            const manager = await buildInventoryManager({ 1: 5000n * USDC, 137: 5000n * USDC });
            const pricing = new DynamicPricing(DEFAULT_PRICING_CONFIG, manager);

            const result = pricing.getPrice(buildBridgeIntent());

            // All required fields present
            expect(result.baseFee).toBeDefined();
            expect(result.gasCost).toBeDefined();
            expect(result.slippageCapture).toBeDefined();
            expect(result.totalFee).toBeDefined();
            expect(result.userPays).toBeDefined();
            expect(result.userReceives).toBeDefined();
            expect(result.solverProfit).toBeDefined();

            // Sanity checks: fees deducted correctly
            expect(BigInt(result.userReceives)).toBeLessThan(BigInt(result.userPays));
            expect(BigInt(result.totalFee)).toBeGreaterThan(0n);
            // totalFee = baseFee + gasCost + slippageCapture
            expect(BigInt(result.totalFee)).toBe(
                BigInt(result.baseFee) + BigInt(result.gasCost) + BigInt(result.slippageCapture)
            );
            // solverProfit = totalFee - gasCost
            expect(BigInt(result.solverProfit)).toBe(
                BigInt(result.totalFee) - BigInt(result.gasCost)
            );
        });
    });
});
