/**
 * Wallet Manager
 *
 * Manages solver's wallet across multiple EVM chains.
 * Single private key → multiple chain connections.
 *
 * NOTE: Ini adalah lightweight abstraction tanpa dependency ethers.js.
 * Di Phase B+ akan di-extend dengan actual ethers.Wallet integration.
 * Untuk sekarang, menyediakan interface dan basic key management.
 *
 * USAGE:
 *   const wallet = new WalletManager("0xprivatekey...", chainRegistry, providerManager);
 *   const address = wallet.getAddress();
 *   const sig = await wallet.signMessage("hello");
 */

import type { Address, ChainId, Hash } from "../../types/common";

/**
 * Wallet signer interface
 *
 * Abstraction atas signing — bisa di-implement dengan ethers.js, viem, atau mock.
 */
export interface WalletSigner {
    /** Get the wallet address */
    getAddress(): Address;

    /** Sign arbitrary message */
    signMessage(message: string): Promise<string>;

    /** Sign typed data (EIP-712) */
    signTypedData?(domain: object, types: object, value: object): Promise<string>;

    /**
     * Send a transaction (sign and broadcast).
     *
     * @param tx - Transaction payload
     * @returns Transaction hash
     */
    sendTransaction?(tx: {
        to: Address;
        data?: `0x${string}`;
        value?: bigint;
        gas?: bigint;
    }): Promise<Hash | string>;
}

/**
 * WalletManager
 *
 * Mengelola private key solver dan menyediakan signing capabilities.
 * Address sama di semua EVM chains (derived dari private key).
 */
export class WalletManager {
    private readonly privateKey: string;
    private cachedAddress: Address | null = null;

    /**
     * Custom signer factory — inject ethers.js or viem signer externally.
     * Jika tidak disediakan, WalletManager hanya mengelola key storage.
     */
    private signerFactory?: (privateKey: string, chainId: ChainId) => WalletSigner;

    constructor(
        privateKey: string,
        signerFactory?: (privateKey: string, chainId: ChainId) => WalletSigner,
    ) {
        if (!privateKey || !privateKey.startsWith("0x")) {
            throw new Error("Private key must be a hex string starting with 0x");
        }

        this.privateKey = privateKey;
        this.signerFactory = signerFactory;
    }

    /**
     * Set or update the signer factory after instantiation.
     */
    setSignerFactory(factory: (privateKey: string, chainId: ChainId) => WalletSigner): void {
        this.signerFactory = factory;
        this.cachedAddress = null; // Invalidate cached address
    }

    /**
     * Get solver's address (same across all EVM chains).
     *
     * Jika signer factory tersedia, derive dari signer.
     * Otherwise, compute from private key secara manual.
     */
    getAddress(): Address {
        if (this.cachedAddress) return this.cachedAddress;

        if (this.signerFactory) {
            // Use signer factory to get address (any chain works, address is same)
            const signer = this.signerFactory(this.privateKey, 1);
            this.cachedAddress = signer.getAddress();
            return this.cachedAddress;
        }

        // Placeholder: In production, derive from private key using elliptic curve
        // For now, store as-is (actual derivation requires crypto library)
        throw new Error(
            "WalletManager requires a signerFactory to derive address. " +
            "Provide one via constructor or use ethers.js integration.",
        );
    }

    /**
     * Sign an arbitrary message with the solver's private key.
     *
     * Requires signerFactory to be configured.
     */
    async signMessage(message: string): Promise<string> {
        const signer = this.getSigner(1); // Chain doesn't matter for signing
        return signer.signMessage(message);
    }

    /**
     * Send a transaction using the solver's configured signer for the chain.
     */
    async sendTransaction(
        chainId: ChainId,
        tx: { to: Address; data?: `0x${string}`; value?: bigint; gas?: bigint },
    ): Promise<Hash | string> {
        const signer = this.getSigner(chainId);
        if (!signer.sendTransaction) {
            throw new Error(`Configured signer for chain ${chainId} does not support sendTransaction`);
        }
        return signer.sendTransaction(tx);
    }

    /**
     * Get a signer for a specific chain.

     *
     * The returned signer has the same address but is connected
     * to the provider for the specified chain.
     */
    getSigner(chainId: ChainId): WalletSigner {
        if (!this.signerFactory) {
            throw new Error(
                "WalletManager requires a signerFactory. " +
                "Provide one via constructor.",
            );
        }
        return this.signerFactory(this.privateKey, chainId);
    }

    /**
     * Get private key (careful — only use internally).
     */
    getPrivateKey(): string {
        return this.privateKey;
    }
}
