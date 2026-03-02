/**
 * E2E: Cross-Chain Bridge Pipeline
 *
 * Tests the complete cross-chain bridge flow on live testnets:
 *   Unichain Sepolia (source, chainId: 1301) → Base Sepolia (target, chainId: 84532)
 *
 * Flow:
 *   [T1] Connectivity — read block number from Unichain Sepolia
 *   [T2] Parse      — parse natural language intent & resolve token addresses
 *   [T3] Preflight  — snapshot initial USDC balances on both chains
 *   [T4] Solve      — solver prices the intent + optimistically fills swapper on Base Sepolia
 *   [T5] Settle     — swapper opens() on Unichain, solver claim()s reimbursement
 *   [T6] Verify     — assert swapper received correct amount on Base Sepolia
 *
 * Required env vars:
 *   UNICHAIN_SEPOLIA_RPC_URL              — Unichain Sepolia RPC endpoint
 *   BASE_SEPOLIA_RPC_URL                  — Base Sepolia RPC endpoint
 *   SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA  — deployed proxy address on Unichain
 *   SETTLEMENT_CONTRACT_BASE_SEPOLIA      — deployed proxy address on Base
 *   SOLVER_PRIVATE_KEY                    — solver wallet private key (no 0x prefix)
 *   TESTING_USER_PRIVATE_KEY              — swapper wallet private key (no 0x prefix)
 *
 * Run:
 *   bun test tests/e2e/testnet-bridge.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
    createPublicClient,
    createWalletClient,
    http,
    encodeAbiParameters,
    encodePacked,
    keccak256,
    toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { IntentParser } from "../../src/parser";
import { enrichIntent } from "@/shared/token-registry/enrichment";
import { IntentSolver } from "@/solver/index";
import { LiveSettlementManager } from "@/solver/settlement/live-settlement-manager";
import { ViemSettlementContract, INTENT_SETTLEMENT_ABI } from "@/solver/contracts/intent-settlement/viem-settlement-contract";
import { RPCProviderManager } from "@/shared/rpc/provider-manager";
import { createViemProviderFactory } from "@/shared/rpc/viem-provider";
import { createViemSignerFactory } from "@/shared/wallet-manager/viem-signer";
import type { Address, ChainId } from "@/types/common";
import { TESTNET_TOKENS } from "@/shared/token-registry/registry";
import { UNICHAIN_SEPOLIA_CONFIG } from "@/shared/chain-registry/configs/unichain-sepolia";
import { BASE_SEPOLIA_CONFIG } from "@/shared/chain-registry/configs/base-sepolia";

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variables
// ─────────────────────────────────────────────────────────────────────────────

const RPC_URL = process.env.UNICHAIN_SEPOLIA_RPC_URL;
const BASE_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const CONTRACT_ADDRESS = process.env.SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA;
const BASE_CONTRACT_ADDRESS = process.env.SETTLEMENT_CONTRACT_BASE_SEPOLIA;
const SOLVER_PRIVATE_KEY = process.env.SOLVER_PRIVATE_KEY;
const USER_PRIVATE_KEY = process.env.TESTING_USER_PRIVATE_KEY;

const HAS_RPC = !!RPC_URL && !!BASE_RPC_URL;
const HAS_CONTRACT = !!CONTRACT_ADDRESS && !!BASE_CONTRACT_ADDRESS;
const HAS_ALL = HAS_RPC && HAS_CONTRACT && !!SOLVER_PRIVATE_KEY && !!USER_PRIVATE_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// Chain Definitions (Viem)
// ─────────────────────────────────────────────────────────────────────────────

const UNICHAIN_SEPOLIA_CHAIN = {
    id: 1301,
    name: "Unichain Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL || ""] },
        public: { http: [RPC_URL || ""] },
    },
    blockExplorers: {
        default: { name: "Blockscout", url: "https://unichain-sepolia.blockscout.com" },
    },
} as const;

const BASE_SEPOLIA_CHAIN = {
    id: 84532,
    name: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: [BASE_RPC_URL || ""] },
        public: { http: [BASE_RPC_URL || ""] },
    },
    blockExplorers: {
        default: { name: "Basescan", url: "https://sepolia.basescan.org" },
    },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Token Addresses (Testnet)
// ─────────────────────────────────────────────────────────────────────────────

const USDC_UNICHAIN_SEPOLIA = "0x31d0220469e10c4E71834a79b1f276d740d3768F";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Intent Text
// ─────────────────────────────────────────────────────────────────────────────

const BRIDGE_INTENT_TEXT = "Bridge 1 USDC from Unichain Sepolia to Base Sepolia";

// ─────────────────────────────────────────────────────────────────────────────
// ERC-20 ABI (minimal)
// ─────────────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }],
    },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper — read USDC balance snapshot for both chains
// ─────────────────────────────────────────────────────────────────────────────

type BalanceSnapshot = {
    unichainUSDC: bigint;
    baseUSDC: bigint;
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E: Cross-Chain Bridge — Unichain Sepolia → Base Sepolia", () => {

    // ── Viem clients ──────────────────────────────────────────────────────────
    let publicClientUnichain: ReturnType<typeof createPublicClient>;
    let publicClientBase: ReturnType<typeof createPublicClient>;
    let solverWalletUnichain: ReturnType<typeof createWalletClient>;
    let swapperWalletUnichain: ReturnType<typeof createWalletClient>;

    // ── Addresses ─────────────────────────────────────────────────────────────
    let solverAddress: Address;
    let swapperAddress: Address;

    // ── SDK modules ───────────────────────────────────────────────────────────
    let parser: IntentParser;
    let solver: IntentSolver;
    let settlementContract: ViemSettlementContract;
    let settlementManager: LiveSettlementManager;

    // ── Cross-test state ──────────────────────────────────────────────────────
    let enrichedIntent: any;
    let globalIntentId: `0x${string}`;
    let transferAmountRaw: bigint;   // amount parsed from NL intent, in USDC base units (6 dec)
    let expectedOutputAmount: bigint;   // userReceives after fees, from solver.solve()

    // ── Balance snapshots ─────────────────────────────────────────────────────
    let initialSolver: BalanceSnapshot;
    let initialSwapper: BalanceSnapshot;

    // ─────────────────────────────────────────────────────────────────────────
    // beforeAll: create clients, instantiate SDK, load inventory
    // ─────────────────────────────────────────────────────────────────────────

    beforeAll(async () => {
        if (!HAS_ALL) return;

        // ── Public clients (read-only) ────────────────────────────────────────
        publicClientUnichain = createPublicClient({
            chain: UNICHAIN_SEPOLIA_CHAIN as any,
            transport: http(RPC_URL!),
        });
        publicClientBase = createPublicClient({
            chain: BASE_SEPOLIA_CHAIN as any,
            transport: http(BASE_RPC_URL!),
        });

        // ── Solver wallet ─────────────────────────────────────────────────────
        const solverAccount = privateKeyToAccount(`0x${SOLVER_PRIVATE_KEY!}` as `0x${string}`);
        solverAddress = solverAccount.address;
        solverWalletUnichain = createWalletClient({
            chain: UNICHAIN_SEPOLIA_CHAIN as any,
            transport: http(RPC_URL!),
            account: solverAccount,
        });

        // ── Swapper wallet ────────────────────────────────────────────────────
        const swapperAccount = privateKeyToAccount(`0x${USER_PRIVATE_KEY!}` as `0x${string}`);
        swapperAddress = swapperAccount.address;
        swapperWalletUnichain = createWalletClient({
            chain: UNICHAIN_SEPOLIA_CHAIN as any,
            transport: http(RPC_URL!),
            account: swapperAccount,
        });

        // ── Settlement contract (Unichain Sepolia) ────────────────────────────
        settlementContract = new ViemSettlementContract(
            CONTRACT_ADDRESS as Address,
            publicClientUnichain as any,
            solverWalletUnichain as any,
        );
        settlementManager = new LiveSettlementManager(settlementContract);

        // ── IntentSolver ──────────────────────────────────────────────────────
        const unichainConfig = { ...UNICHAIN_SEPOLIA_CONFIG, rpcUrl: RPC_URL! };
        const baseConfig = { ...BASE_SEPOLIA_CONFIG, rpcUrl: BASE_RPC_URL! };

        solver = new IntentSolver({
            agent: {
                privateKey: `0x${SOLVER_PRIVATE_KEY!}`,
                supportedChains: [1301, 84532],
                supportedTokens: ["USDC"],
                mode: "live",
            },
            contractAddress: CONTRACT_ADDRESS as Address,
            // Competitive fee settings for testnet (low slippage capture & base fee)
            pricing: {
                minFeeUSD: 0.10,
                baseFeePercent: 0.001,
                slippageSharePercent: 0.10,
                maxFeePercent: 0.01,
            },
        });

        solver.tokenRegistry.registerAll(TESTNET_TOKENS);

        // Guard against double-register: constructor already registers SUPPORTED_CHAINS (mainnet).
        // These are testnet chains (1301, 84532), so no conflict expected, but guard defensively.
        if (!solver.chainRegistry.has(unichainConfig.id)) solver.chainRegistry.register(unichainConfig);
        if (!solver.chainRegistry.has(baseConfig.id)) solver.chainRegistry.register(baseConfig);

        const providerFactory = createViemProviderFactory();
        solver.rpcProviderManager.setProviderFactory(providerFactory);
        solver.rpcProviderManager.registerChain(unichainConfig);
        solver.rpcProviderManager.registerChain(baseConfig);

        const rpcMapper = (chainId: ChainId) => {
            if (chainId === 1301) return unichainConfig.rpcUrl;
            if (chainId === 84532) return baseConfig.rpcUrl;
            return undefined;
        };
        solver.walletManager.setSignerFactory(createViemSignerFactory(rpcMapper));

        await solver.initialize();
        // Reload balances after registering chains/tokens so InventoryManager tracks them.
        await solver.agent.inventoryManager.loadBalances();

        parser = new IntentParser();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // [T1] Connectivity
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_RPC)(
        "[T1] should connect to Unichain Sepolia and read current block number",
        async () => {
            const blockNumber = await publicClientUnichain.getBlockNumber();
            expect(blockNumber).toBeGreaterThan(0n);
            console.log("[T1] Unichain Sepolia block number:", blockNumber.toString());
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // [T2] Intent Parsing & Token Enrichment
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_ALL)(
        "[T2] should parse intent text and resolve USDC addresses on both chains",
        async () => {
            const rawIntent = await parser.parse(BRIDGE_INTENT_TEXT);
            expect(rawIntent.success).toBe(true);
            expect(rawIntent.data!.intentType).toBe("bridge");

            const intentData = rawIntent.data as any;

            // Parser only extracts inputToken — for a same-token bridge, outputToken = inputToken.
            if (!intentData.parameters.outputToken && intentData.parameters.inputToken) {
                intentData.parameters.outputToken = intentData.parameters.inputToken;
            }

            // Enrich: source = Unichain (1301), target = Base (84532)
            enrichedIntent = enrichIntent(intentData, solver.tokenRegistry, 1301, 84532);
            expect(enrichedIntent.parameters.inputTokenAddress).toBeDefined();
            expect(enrichedIntent.parameters.outputTokenAddress.toLowerCase())
                .toBe(USDC_BASE_SEPOLIA.toLowerCase());

            console.log("[T2] Source token (Unichain):", enrichedIntent.parameters.inputTokenAddress);
            console.log("[T2] Target token (Base):    ", enrichedIntent.parameters.outputTokenAddress);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // [T3] Preflight — snapshot balances before the bridge
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_ALL)(
        "[T3] should snapshot USDC balances on both chains before bridging",
        async () => {
            const readUsdc = async (client: typeof publicClientUnichain, token: string, who: Address) =>
                client.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

            initialSolver = {
                unichainUSDC: await readUsdc(publicClientUnichain, USDC_UNICHAIN_SEPOLIA, solverAddress),
                baseUSDC: await readUsdc(publicClientBase, USDC_BASE_SEPOLIA, solverAddress),
            };
            initialSwapper = {
                unichainUSDC: await readUsdc(publicClientUnichain, USDC_UNICHAIN_SEPOLIA, swapperAddress),
                baseUSDC: await readUsdc(publicClientBase, USDC_BASE_SEPOLIA, swapperAddress),
            };

            console.log("=== INITIAL BALANCES ===");
            console.log(`[Solver]  Unichain: ${initialSolver.unichainUSDC}  | Base: ${initialSolver.baseUSDC}`);
            console.log(`[Swapper] Unichain: ${initialSwapper.unichainUSDC} | Base: ${initialSwapper.baseUSDC}`);
            console.log("========================");

            // Solver must have enough USDC on Base Sepolia to fill the swap.
            const parsedAmount = BigInt(enrichedIntent.parameters.inputAmount);
            transferAmountRaw = parsedAmount * BigInt(10 ** USDC_DECIMALS);
            expect(initialSolver.baseUSDC).toBeGreaterThanOrEqual(transferAmountRaw);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // [T4] Solve Intent — optimistic fill on Base Sepolia
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_ALL)(
        "[T4] should open intent on Unichain, fill swapper on Base, then auto-settle (full cycle)",
        async () => {
            // Use a shared deadline & nonce so the order Swapper signs for open() is
            // IDENTICAL to the order SettlementManager builds inside claim().
            const sharedDeadline = Math.floor(Date.now() / 1000) + 3600;
            const sharedNonce = BigInt(Math.floor(Date.now() / 1000));

            // orderData = abi.encode(address inputToken, uint256 amount)
            // Matches what SettlementManager computes from intent.parsedIntent.parameters
            const orderData = encodeAbiParameters(
                [{ type: "address" }, { type: "uint256" }],
                [USDC_UNICHAIN_SEPOLIA as Address, transferAmountRaw],
            );

            // Build the CrossChainOrder that the contract needs.
            // This MUST match the order SettlementManager builds in settleIntent().
            const t4Order = {
                settlementContract: CONTRACT_ADDRESS as Address,
                swapper: swapperAddress,
                nonce: sharedNonce,
                originChainId: 1301,
                initiateDeadline: sharedDeadline,
                fillDeadline: sharedDeadline,
                orderData,
            };

            // ── Step 1: Swapper approve USDC spend by contract ─────────────────
            console.log("[T4] Swapper approving USDC on Unichain...");
            const approveHash = await swapperWalletUnichain.writeContract({
                chain: UNICHAIN_SEPOLIA_CHAIN as any,
                address: USDC_UNICHAIN_SEPOLIA as Address,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [CONTRACT_ADDRESS as Address, transferAmountRaw],
            });
            await publicClientUnichain.waitForTransactionReceipt({ hash: approveHash });

            // ── Step 2: Swapper sign EIP-712 order & call open() ───────────────
            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: 1301,
                verifyingContract: CONTRACT_ADDRESS as Address,
            } as const;

            const types = {
                CrossChainOrder: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" },
                ],
            } as const;

            const swapperSig = await swapperWalletUnichain.signTypedData({
                domain, types, primaryType: "CrossChainOrder", message: t4Order,
            });

            console.log("[T4] Swapper opening intent on Unichain (locking USDC in contract)...");
            const openHash = await swapperWalletUnichain.writeContract({
                chain: UNICHAIN_SEPOLIA_CHAIN as any,
                address: CONTRACT_ADDRESS as Address,
                abi: INTENT_SETTLEMENT_ABI,
                functionName: "open",
                args: [t4Order, swapperSig, orderData],
            });
            await publicClientUnichain.waitForTransactionReceipt({ hash: openHash });
            console.log("[T4] open() confirmed:", openHash);

            // ── Step 3: Solver fills + auto-settles ────────────────────────────
            // intentParams must mirror t4Order fields so SettlementManager builds
            // the same order struct and keccak256(abi.encode(order)) matches open().
            const intentParams = {
                ...enrichedIntent.parameters,
                recipient: swapperAddress,
                sourceChain: 1301,
                targetChain: 84532,
                inputAmount: transferAmountRaw.toString(),
                nonce: sharedNonce.toString(),           // ← must match t4Order.nonce
                // No initiateDeadline set → SettlementManager uses intent.deadline
            };

            globalIntentId = keccak256(toBytes("intent-" + Date.now()));

            const solverIntent = {
                intentId: globalIntentId,
                intentHash: ("0x" + "0".repeat(64)) as `0x${string}`,
                user: swapperAddress,
                signature: "0x",
                deadline: sharedDeadline,               // ← must match t4Order.fillDeadline
                status: "pending" as const,
                solver: solverAddress,
                parsedIntent: { ...enrichedIntent, parameters: intentParams },
                receivedAt: Date.now(),
            };

            // solve() fills on Base Sepolia, then SettlementManager auto-claims on Unichain.
            const result = await solver.solve(solverIntent as any);
            console.log("[T4] Solver result:", result);

            if (!result.success) {
                console.error("[T4] Solver error:", result.error);
            }
            expect(result.success).toBe(true);
            expect(result.output).toBeDefined();

            expectedOutputAmount = BigInt(result.output as string);
            expect(expectedOutputAmount).toBeGreaterThan(0n);

            console.log("[T4] Intent ID:          ", globalIntentId);
            console.log("[T4] Input amount:       ", transferAmountRaw.toString(), "USDC base units");
            console.log("[T4] Output to swapper:  ", expectedOutputAmount.toString(), "USDC base units");
            console.log("[T4] Bridge fill tx:     ", result.txHash);

            // Allow time for the Base node to index the transaction before T6 reads balances.
            await new Promise((resolve) => setTimeout(resolve, 5000));
        },
        120_000   // longer timeout: open() + fill + claim across two chains
    );

    // ─────────────────────────────────────────────────────────────────────────
    // [T5] On-chain Settlement — swapper open() → solver claim()
    // ─────────────────────────────────────────────────────────────────────────

    let claimTxHash: `0x${string}`;

    test.skipIf(!HAS_ALL)(
        "[T5] should open an intent on Unichain and let solver claim() reimbursement",
        async () => {
            // 1. Swapper approves settlement contract to pull USDC on Unichain.
            const approveHash = await swapperWalletUnichain.writeContract({
                chain: UNICHAIN_SEPOLIA_CHAIN as any,
                address: USDC_UNICHAIN_SEPOLIA as Address,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [CONTRACT_ADDRESS as Address, transferAmountRaw],
            });
            await publicClientUnichain.waitForTransactionReceipt({ hash: approveHash });

            // 2. Build CrossChainOrder.
            const orderData = encodeAbiParameters(
                [{ type: "address", name: "token" }, { type: "uint256", name: "amount" }],
                [USDC_UNICHAIN_SEPOLIA, transferAmountRaw],
            );

            const order = {
                settlementContract: CONTRACT_ADDRESS as Address,
                swapper: swapperAddress,
                nonce: BigInt(Math.floor(Math.random() * 1_000_000)),
                originChainId: 1301,
                initiateDeadline: Math.floor(Date.now() / 1000) + 3600,
                fillDeadline: Math.floor(Date.now() / 1000) + 3600,
                orderData,
            };

            // 3. Swapper signs the order (EIP-712).
            const domain = {
                name: "IntentSettlement",
                version: "1",
                chainId: 1301,
                verifyingContract: CONTRACT_ADDRESS as Address,
            } as const;

            const types = {
                CrossChainOrder: [
                    { name: "settlementContract", type: "address" },
                    { name: "swapper", type: "address" },
                    { name: "nonce", type: "uint256" },
                    { name: "originChainId", type: "uint32" },
                    { name: "initiateDeadline", type: "uint32" },
                    { name: "fillDeadline", type: "uint32" },
                    { name: "orderData", type: "bytes" },
                ],
            } as const;

            const swapperSignature = await swapperWalletUnichain.signTypedData({
                domain, types, primaryType: "CrossChainOrder", message: order,
            });

            // 4. Swapper calls open() — locks USDC on Unichain.
            console.log("[T5] Swapper opening intent on Unichain...");
            const openHash = await swapperWalletUnichain.writeContract({
                chain: UNICHAIN_SEPOLIA_CHAIN as any,
                address: CONTRACT_ADDRESS as Address,
                abi: INTENT_SETTLEMENT_ABI,
                functionName: "open",
                args: [order, swapperSignature, orderData],
            });
            await publicClientUnichain.waitForTransactionReceipt({ hash: openHash });

            // 5. Compute intentId = keccak256(ABI-encoded order).
            const encodedOrder = encodeAbiParameters(
                [{
                    type: "tuple",
                    components: [
                        { name: "settlementContract", type: "address" },
                        { name: "swapper", type: "address" },
                        { name: "nonce", type: "uint256" },
                        { name: "originChainId", type: "uint32" },
                        { name: "initiateDeadline", type: "uint32" },
                        { name: "fillDeadline", type: "uint32" },
                        { name: "orderData", type: "bytes" },
                    ],
                }],
                [order],
            );
            globalIntentId = keccak256(encodedOrder);

            // 6. Solver signs oracle proof that fill already happened on Base Sepolia.
            const oracleDigest = keccak256(encodePacked(
                ["bytes32", "string", "address"],
                [globalIntentId, "FILLED", solverAddress],
            ));
            const solverAccount = privateKeyToAccount(`0x${SOLVER_PRIVATE_KEY!}` as `0x${string}`);
            const oracleSignature = await solverAccount.signMessage({ message: { raw: toBytes(oracleDigest) } });

            // 7. Solver calls claim() — pulls locked USDC from Unichain contract.
            console.log("[T5] Solver claiming reimbursement on Unichain...");
            const claimResult = await settlementManager.settleOnChain({
                intentId: globalIntentId,
                swapper: order.swapper,
                token: USDC_UNICHAIN_SEPOLIA as Address,
                amount: transferAmountRaw,
                recipient: solverAddress,
                nonce: order.nonce,
                originChainId: order.originChainId,
                initiateDeadline: order.initiateDeadline,
                fillDeadline: order.fillDeadline,
            }, oracleSignature);

            expect(claimResult.fillTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(claimResult.blockNumber).toBeGreaterThan(0n);

            claimTxHash = claimResult.fillTxHash as `0x${string}`;
            console.log("[T5] Claim tx:", claimTxHash);

            await publicClientUnichain.waitForTransactionReceipt({ hash: claimTxHash });
        },
        { timeout: 60_000 }
    );

    // ─────────────────────────────────────────────────────────────────────────
    // [T6] Verify Final Balances
    // ─────────────────────────────────────────────────────────────────────────

    test.skipIf(!HAS_ALL)(
        "[T6] should verify swapper received USDC on Base Sepolia and intent is settled on Unichain",
        async () => {
            const readUsdc = async (client: typeof publicClientUnichain, token: string, who: Address) =>
                client.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

            const finalSolver: BalanceSnapshot = {
                unichainUSDC: await readUsdc(publicClientUnichain, USDC_UNICHAIN_SEPOLIA, solverAddress),
                baseUSDC: await readUsdc(publicClientBase, USDC_BASE_SEPOLIA, solverAddress),
            };
            const finalSwapper: BalanceSnapshot = {
                unichainUSDC: await readUsdc(publicClientUnichain, USDC_UNICHAIN_SEPOLIA, swapperAddress),
                baseUSDC: await readUsdc(publicClientBase, USDC_BASE_SEPOLIA, swapperAddress),
            };

            // Breakdown of all balance changes from T4 and T5:
            //   T4: Solver sends `expectedOutputAmount` USDC to swapper on Base Sepolia.
            //       SettlementManager also calls claim() → solver gets `transferAmountRaw` on Unichain.
            //   T5: Swapper calls open() → locks `transferAmountRaw` on Unichain.
            //       Solver calls claim() again → solver gets another `transferAmountRaw` on Unichain.

            const solverUnichainDelta = finalSolver.unichainUSDC - initialSolver.unichainUSDC;
            const solverBaseDelta = finalSolver.baseUSDC - initialSolver.baseUSDC;
            const swapperUnichainDelta = finalSwapper.unichainUSDC - initialSwapper.unichainUSDC;
            const swapperBaseDelta = finalSwapper.baseUSDC - initialSwapper.baseUSDC;

            console.log("=== FINAL BALANCES ===");
            console.log(`[Solver]  Unichain: ${finalSolver.unichainUSDC} (Δ${solverUnichainDelta})  | Base: ${finalSolver.baseUSDC} (Δ${solverBaseDelta})`);
            console.log(`[Swapper] Unichain: ${finalSwapper.unichainUSDC} (Δ${swapperUnichainDelta}) | Base: ${finalSwapper.baseUSDC} (Δ${swapperBaseDelta})`);
            console.log("======================");

            // Swapper Base: received `expectedOutputAmount` from T4 fill.
            // (T5 open() only affects Unichain, not Base)
            expect(finalSwapper.baseUSDC).toBe(initialSwapper.baseUSDC + expectedOutputAmount);

            // Swapper Unichain: lost `transferAmountRaw` × 2:
            //   - T4: Swapper called open() → locked 1 USDC in contract
            //   - T5: Swapper called open() → locked 1 USDC in contract
            expect(finalSwapper.unichainUSDC).toBe(initialSwapper.unichainUSDC - transferAmountRaw * 2n);

            // Solver Unichain: gained `transferAmountRaw` × 2:
            //   - T4: SettlementManager auto-claim() succeeds (open() was called first)
            //   - T5: Explicit claim() succeeds
            expect(finalSolver.unichainUSDC).toBe(initialSolver.unichainUSDC + transferAmountRaw * 2n);

            // Solver Base: spent `expectedOutputAmount` to fill swapper in T4.
            expect(finalSolver.baseUSDC).toBe(initialSolver.baseUSDC - expectedOutputAmount);

            // Contract marks the T5 intent as settled.
            const isSettled = await settlementContract.isSettled(globalIntentId);
            expect(isSettled).toBe(true);
        }
    );
});
