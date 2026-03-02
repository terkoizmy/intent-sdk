/**
 * Proof Generator — Phase E
 *
 * Generates cross-chain proofs (EIP-191 personal signature) that attest
 * the solver has fulfilled the intent on the target chain.
 *
 * Flow:
 *   1. Solver sends funds on target chain → gets txHash
 *   2. Wait for N confirmations on target chain
 *   3. Sign message: keccak256(intentId, "FILLED", solverAddress)
 *   4. Return CrossChainProof for use in claim()
 *
 * Used by: SettlementManager.settleIntent()
 */

import { ethers } from "ethers";
import { ProofGenerationError } from "../../errors/settlement-errors";
import type { ChainId, Hash } from "../../types/common";
import type { CrossChainProof, IProofSigner, IProviderForProof, ProofGenerationParams } from "../types/settlement";



// ─────────────────────────────────────────────
// ProofGenerator
// ─────────────────────────────────────────────

export class ProofGenerator {
    constructor(
        private readonly signer: IProofSigner,
        private readonly provider: IProviderForProof,
    ) { }

    // ─────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────

    /**
     * Generate a cross-chain signature proof.
     *
     * Steps:
     *   1. Wait for sufficient confirmations on target chain
     *   2. Build digest from intentId and solver address
     *   3. Sign with oracle's private key
     *   4. Return CrossChainProof
     *
     * @param params - ProofGenerationParams
     * @returns CrossChainProof ready for claim()
     * @throws ProofGenerationError if tx not found, reverted, or signing fails
     */
    async generateSignatureProof(params: ProofGenerationParams): Promise<CrossChainProof> {
        const confirmations = params.confirmations ?? 3;
        await this.waitForConfirmations(params.targetTxHash, params.targetChainId, confirmations);

        const receipt = await this.provider.getTransactionReceipt(params.targetChainId, params.targetTxHash);
        if (!receipt) {
            throw new ProofGenerationError(`Transaction ${params.targetTxHash} not found`);
        }
        if (receipt.status === 0) {
            throw new ProofGenerationError(`Transaction ${params.targetTxHash} reverted`);
        }

        const solverAddress = await this.signer.getAddress();

        // Keccak256(abi.encodePacked(intentId, "FILLED", solverAddress))
        const digest = ethers.solidityPackedKeccak256(
            ["bytes32", "string", "address"],
            [params.intentId, "FILLED", solverAddress]
        );

        const signature = await this.signer.signMessage(ethers.getBytes(digest));

        return {
            txHash: params.targetTxHash,
            chainId: params.targetChainId,
            blockNumber: receipt.blockNumber,
            solverSignature: signature,
            signedData: {
                intentId: params.intentId as Hash,
                targetTxHash: params.targetTxHash,
                amount: params.amount,
                recipient: params.recipient,
            }
        };
    }

    /**
     * Wait until a transaction has enough block confirmations.
     *
     * Polls the chain every ~2 seconds until:
     *   currentBlock - txBlock >= requiredConfirmations
     *
     * @param txHash - Transaction hash to watch
     * @param chainId - Chain ID where the tx lives
     * @param confirmations - Number of confirmations required
     * @throws ProofGenerationError if tx not found or reverted
     */
    async waitForConfirmations(
        txHash: Hash,
        chainId: ChainId,
        confirmations: number,
    ): Promise<void> {
        const maxAttempts = 60; // Up to ~120 seconds
        const delayMs = 2000;

        for (let i = 0; i < maxAttempts; i++) {
            const receipt = await this.provider.getTransactionReceipt(chainId, txHash);
            if (receipt) {
                if (receipt.status === 0) {
                    throw new ProofGenerationError(`Transaction ${txHash} reverted on chain ${chainId}`);
                }
                const currentBlock = await this.provider.getBlockNumber(chainId);
                if (currentBlock - receipt.blockNumber >= confirmations) {
                    return; // Enough confirmations
                }
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        throw new ProofGenerationError(`Timeout waiting for ${confirmations} confirmations on ${txHash}`);
    }
}
