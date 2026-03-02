/**
 * viem Wallet Signer
 *
 * Implements WalletSigner interface using viem's privateKeyToAccount + createWalletClient.
 * Provides real transaction signing and EIP-712 typed data signing.
 *
 * Stage 3 — Live Integration (Phase B)
 *
 * USAGE:
 *   import { createViemSignerFactory } from "./viem-signer";
 *   const wallet = new WalletManager("0xprivatekey...", createViemSignerFactory());
 *   const address = wallet.getAddress();
 *   const sig = await wallet.signMessage("hello");
 */

import { createWalletClient, http, defineChain, type WalletClient, type HttpTransport, type Chain } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Address, ChainId } from "../../types/common";
import type { WalletSigner } from "./wallet-manager";

/**
 * WalletSigner implementation backed by viem's WalletClient.
 */
export class ViemSigner implements WalletSigner {
    private account: PrivateKeyAccount;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private walletClient: WalletClient<HttpTransport, any>;
    private chain: Chain | undefined;

    constructor(privateKey: `0x${string}`, chainId: ChainId, rpcUrl?: string) {
        this.account = privateKeyToAccount(privateKey);

        // Build a minimal viem chain definition so viem includes the
        // correct chainId in EIP-155 signatures and knows tx type parameters.
        this.chain = rpcUrl
            ? defineChain({
                id: chainId,
                name: `Chain ${chainId}`,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: {
                    default: { http: [rpcUrl] },
                },
            })
            : undefined;

        this.walletClient = createWalletClient({
            account: this.account,
            chain: this.chain,
            transport: http(rpcUrl || "http://offline-signer.local"),
        });
    }

    /**
     * Get the wallet address derived from the private key.
     */
    getAddress(): Address {
        return this.account.address as Address;
    }

    /**
     * Sign an arbitrary message using personal_sign.
     */
    async signMessage(message: string): Promise<string> {
        return await this.walletClient.signMessage({ account: this.account, message });
    }

    /**
     * Sign EIP-712 typed data.
     *
     * Used for creating intent signatures compatible with IntentSettlement.sol.
     */
    async signTypedData(domain: object, types: object, value: object): Promise<string> {
        // Extract primary type from types (usually the first key that isn't EIP712Domain)
        const primaryType = Object.keys(types).find((t) => t !== "EIP712Domain");
        if (!primaryType) {
            throw new Error("Could not determine primaryType from types");
        }

        return await this.walletClient.signTypedData({
            account: this.account,
            domain,
            types: types as Record<string, unknown>,
            primaryType,
            message: value as Record<string, unknown>,
        });
    }

    /**
     * Send a transaction through this wallet (sign + broadcast).
     *
     * Returns the transaction hash.
     */
    async sendTransaction(tx: {
        to: Address;
        data?: `0x${string}`;
        value?: bigint;
        gas?: bigint;
    }): Promise<string> {
        return await this.walletClient.sendTransaction({
            account: this.account,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gas: tx.gas,
            // Pass the configured chain; null bypasses per-call chain ID check for offline signers
            chain: this.chain ?? null,
        });
    }

    /**
     * Get the underlying viem account (for advanced use cases).
     */
    getAccount(): PrivateKeyAccount {
        return this.account;
    }
}

/**
 * Factory function that creates ViemSigner instances.
 *
 * Pass this to WalletManager constructor as the signerFactory.
 *
 * Factory for creating viem signers.
 * Suitable for injection into WalletManager.
 *
 * @param rpcMapper - Optional function to provide RPC URLs for specific chains
 *                    (required for `sendTransaction` live execution).
 */
export function createViemSignerFactory(
    rpcMapper?: (chainId: ChainId) => string | undefined
): (privateKey: string, chainId: ChainId) => WalletSigner {
    return (privateKey: string, chainId: ChainId) => {
        const rpcUrl = rpcMapper ? rpcMapper(chainId) : undefined;
        return new ViemSigner(privateKey as `0x${string}`, chainId, rpcUrl);
    };
}
