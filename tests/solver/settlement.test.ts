/**
 * Settlement Tests — Stage 2 Phase E
 *
 * Tests for ProofGenerator, ProofVerifier, and SettlementManager.
 *
 * Run: bun test tests/solver/settlement.test.ts
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ProofGenerator } from "../../src/solver/settlement/proof-generator";
import { ProofVerifier } from "../../src/solver/settlement/proof-verifier";
import { SettlementManager, DEFAULT_SETTLEMENT_CONFIG } from "../../src/solver/settlement/settlement-manager";
import type { CrossChainProof, ProofGenerationParams, IProofSigner, IProviderForProof } from "../../src/solver/types/settlement";
import type { SolverIntent } from "../../src/solver/types/intent";
import type { Address, Hash, ChainId } from "../../src/types/common";

import { ethers } from "ethers";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MOCK_WALLET = ethers.Wallet.createRandom();
const SOLVER_ADDRESS = MOCK_WALLET.address as Address;
const USER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const MOCK_TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hash;
const USDC = 1_000_000n; // 1 USDC

// ─────────────────────────────────────────────
// Mock Factories
// ─────────────────────────────────────────────

function mockSigner(): IProofSigner {
    return {
        getAddress: () => SOLVER_ADDRESS,
        signMessage: async (msg) => MOCK_WALLET.signMessage(msg),
    };
}

function mockProvider(opts: { blockNumber?: number; txStatus?: number } = {}): IProviderForProof {
    return {
        getTransactionReceipt: async (_chainId: ChainId, _txHash: Hash) => ({
            blockNumber: opts.blockNumber ?? 100,
            status: opts.txStatus ?? 1,
        }),
        getBlockNumber: async (_chainId: ChainId) => (opts.blockNumber ?? 100) + 5,
    };
}

function mockContract() {
    return {
        claim: async (_order: any, _signature: string) => ({
            hash: "0xsourceTxHash",
            wait: async () => ({ status: 1 }),
        }),
        isSettled: async (_intentId: string) => false,
        open: async () => ({}),
        refund: async () => ({}),
        waitForLockEvent: async () => true,
        getAddress: async () => "0xContractAddress",
    };
}

function buildMockIntent(overrides: Partial<SolverIntent> = {}): SolverIntent {
    return {
        intentId: "test-intent-001",
        intentHash: "0xhash" as Hash,
        user: USER_ADDRESS,
        signature: "0xusersig",
        deadline: Math.floor(Date.now() / 1000) + 3600,
        status: "fulfilling",
        receivedAt: Date.now(),
        solver: SOLVER_ADDRESS,
        parsedIntent: {
            intentType: "bridge",
            parameters: {
                nonce: "1",
                inputToken: "USDC",
                inputAmount: (1000n * USDC).toString(),
                sourceChain: "1",
                targetChain: "137",
                recipient: USER_ADDRESS,
            },
            constraints: {
                maxSlippage: 100,
            },
        } as any,
        ...overrides,
    };
}

// ─────────────────────────────────────────────
// ProofGenerator Tests
// ─────────────────────────────────────────────

describe("ProofGenerator", () => {
    let generator: ProofGenerator;

    beforeEach(() => {
        generator = new ProofGenerator(mockSigner(), mockProvider());
    });

    describe("generateSignatureProof()", () => {
        test("should generate a valid CrossChainProof", async () => {
            const proof = await generator.generateSignatureProof({
                intentId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                targetTxHash: MOCK_TX_HASH,
                targetChainId: 137 as ChainId,
                amount: (1000n * USDC).toString(),
                recipient: USER_ADDRESS,
                confirmations: 3,
            });
            expect(proof.txHash).toBe(MOCK_TX_HASH);
            expect(proof.chainId).toBe(137);
            expect(proof.solverSignature).toBeDefined();
            expect(proof.signedData).toBeDefined();
            expect(proof.signedData?.intentId).toBe("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
        });

        test("should throw if transaction reverted", async () => {
            const failGenerator = new ProofGenerator(
                mockSigner(),
                mockProvider({ txStatus: 0 }),
            );
            expect(failGenerator.generateSignatureProof({
                intentId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                targetTxHash: MOCK_TX_HASH,
                targetChainId: 137 as ChainId,
                amount: (1000n * USDC).toString(),
                recipient: USER_ADDRESS,
                confirmations: 3,
            })).rejects.toThrow();
        });
    });

    describe("waitForConfirmations()", () => {
        test("should resolve when enough confirmations reached", async () => {
            await expect(
                generator.waitForConfirmations(MOCK_TX_HASH, 137 as ChainId, 3)
            ).resolves.toBeUndefined();
        });

        test("should throw on timeout if confirmations not reached", async () => {
            const originalSetTimeout = global.setTimeout;
            (global as any).setTimeout = (cb: any) => cb(); // Instant timeout

            const badProvider = mockProvider({ blockNumber: 10 });
            badProvider.getBlockNumber = async () => 10;
            const failGenerator = new ProofGenerator(mockSigner(), badProvider);

            await expect(
                failGenerator.waitForConfirmations(MOCK_TX_HASH, 137 as ChainId, 3)
            ).rejects.toThrow(/Timeout/);

            global.setTimeout = originalSetTimeout;
        });
    });
});

// ─────────────────────────────────────────────
// ProofVerifier Tests
// ─────────────────────────────────────────────

describe("ProofVerifier", () => {
    let verifier: ProofVerifier;

    let generator: ProofGenerator;

    beforeEach(() => {
        verifier = new ProofVerifier();
        generator = new ProofGenerator(mockSigner(), mockProvider());
    });

    describe("verifySignatureProof()", () => {
        test("should return true for valid proof signed by expected solver", async () => {
            const proof = await generator.generateSignatureProof({
                intentId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                targetTxHash: MOCK_TX_HASH,
                targetChainId: 137 as ChainId,
                amount: "100",
                recipient: USER_ADDRESS,
            });
            const result = await verifier.verifySignatureProof(proof, SOLVER_ADDRESS, SOLVER_ADDRESS);
            expect(result).toBe(true);
        });

        test("should return false for proof signed by different address", async () => {
            const proof = await generator.generateSignatureProof({
                intentId: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                targetTxHash: MOCK_TX_HASH,
                targetChainId: 137 as ChainId,
                amount: "100",
                recipient: USER_ADDRESS,
            });
            const otherAddress = ethers.Wallet.createRandom().address as Address;
            const result = await verifier.verifySignatureProof(proof, otherAddress, SOLVER_ADDRESS);
            expect(result).toBe(false);
        });

        test("should return false if signedData is missing", async () => {
            const proof = {
                txHash: MOCK_TX_HASH,
                chainId: 137 as ChainId,
                blockNumber: 100,
                solverSignature: "0x123",
            } as any;
            const result = await verifier.verifySignatureProof(proof, SOLVER_ADDRESS, SOLVER_ADDRESS);
            expect(result).toBe(false);
        });
    });
});

// ─────────────────────────────────────────────
// SettlementManager Tests
// ─────────────────────────────────────────────

describe("SettlementManager", () => {
    let manager: SettlementManager;

    beforeEach(() => {
        const generator = new ProofGenerator(mockSigner(), mockProvider());
        const verifier = new ProofVerifier();
        manager = new SettlementManager(
            generator,
            verifier,
            mockContract() as any,
            DEFAULT_SETTLEMENT_CONFIG,
        );
    });

    describe("settleIntent()", () => {
        test("should complete full settlement flow", async () => {
            const intent = buildMockIntent({ intentId: "0x" + "11".repeat(32) });
            const settlement = await manager.settleIntent(intent, MOCK_TX_HASH);
            expect(settlement.status).toBe("completed");
            expect(settlement.intentId).toBe("0x" + "11".repeat(32));
            expect(settlement.proof).toBeDefined();
            expect(settlement.sourceTx).toBeDefined();
        });

        test("should set status to failed on claim error", async () => {
            const badContract = mockContract();
            badContract.claim = async () => { throw new Error("Claim reverted") };
            manager = new SettlementManager(
                new ProofGenerator(mockSigner(), mockProvider()),
                new ProofVerifier(),
                badContract as any,
                DEFAULT_SETTLEMENT_CONFIG,
            );

            const intent = buildMockIntent({ intentId: "0x" + "22".repeat(32) });
            await expect(manager.settleIntent(intent, MOCK_TX_HASH)).rejects.toThrow();

            const settlement = manager.getSettlement("0x" + "22".repeat(32));
            expect(settlement?.status).toBe("failed");
            expect(settlement?.claimAttempts).toBe(1);
        });
    });

    describe("handleClaimFailure()", () => {
        test("should increment claimAttempts on failure", async () => {
            const intentId = "0x" + "33".repeat(32);
            manager["settlements"].set(intentId, {
                intentId: intentId,
                solver: SOLVER_ADDRESS,
                targetTx: MOCK_TX_HASH,
                status: "pending",
                startedAt: 123,
                claimAttempts: 0
            });
            await manager.handleClaimFailure(intentId, new Error("Test"));
            const s = manager.getSettlement(intentId);
            expect(s?.claimAttempts).toBe(1);
            expect(s?.status).toBe("failed");
        });

        test("should mark as permanently failed after max retries", async () => {
            const intentId = "0x" + "44".repeat(32);
            manager["settlements"].set(intentId, {
                intentId: intentId,
                solver: SOLVER_ADDRESS,
                targetTx: MOCK_TX_HASH,
                status: "pending",
                startedAt: 123,
                claimAttempts: 2
            });
            await manager.handleClaimFailure(intentId, new Error("Test"));
            const s = manager.getSettlement(intentId);
            expect(s?.claimAttempts).toBe(3);
            expect(s?.status).toBe("failed");
        });
    });

    describe("getters", () => {
        test("getSettlement should return undefined for unknown intentId", () => {
            expect(manager.getSettlement("nonexistent")).toBeUndefined();
        });

        test("getAllSettlements should return empty array initially", () => {
            expect(manager.getAllSettlements()).toEqual([]);
        });

        test("getSettlementsByStatus should filter correctly", () => {
            // Already works since getters are implemented
            const pending = manager.getSettlementsByStatus("pending");
            expect(pending).toEqual([]);
        });
    });
});
