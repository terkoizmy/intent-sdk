/**
 * Proof Verifier — Phase E
 *
 * Verifies cross-chain proofs by recovering the signer from
 * the EIP-712 signature and comparing to the expected solver address.
 *
 * Used by:
 *   - SettlementManager (pre-claim sanity check)
 *   - Contract's claim() also verifies on-chain, but we check off-chain first
 *     to avoid wasting gas on invalid proofs
 */

import { ethers } from "ethers";
import type { Address } from "../../types/common";
import type { CrossChainProof } from "../types/settlement";

// ─────────────────────────────────────────────
// ProofVerifier
// ─────────────────────────────────────────────

export class ProofVerifier {

    /**
     * Verify that a CrossChainProof was signed by the expected oracle/solver.
     *
     * Steps:
     *   1. Reconstruct digest from intentId and expected solver address
     *   2. Recover signer address from proof.solverSignature
     *   3. Compare recovered address with expectedSigner
     *   4. Return true if match, false otherwise
     *
     * @param proof - The CrossChainProof to verify
     * @param expectedSigner - The address we expect to have signed (e.g. Oracle address)
     * @param solverAddress - The solver address that was injected into the digest
     * @returns true if proof is valid
     */
    async verifySignatureProof(
        proof: CrossChainProof,
        expectedSigner: Address,
        solverAddress: Address
    ): Promise<boolean> {
        if (!proof.signedData || !proof.signedData.intentId) {
            return false;
        }

        try {
            const digest = ethers.solidityPackedKeccak256(
                ["bytes32", "string", "address"],
                [proof.signedData.intentId, "FILLED", solverAddress]
            );

            // Recover signer using EIP-191 personal sign recovery
            const recoveredAddress = ethers.verifyMessage(ethers.getBytes(digest), proof.solverSignature);

            return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
        } catch (error) {
            return false;
        }
    }
}
