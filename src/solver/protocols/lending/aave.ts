/**
 * Aave Protocol Integration — Phase I
 *
 * Lending protocol integration.
 * Allows depositing idle inventory into Aave to earn APY, and withdrawing it
 * when needed to fulfill intents.
 */

import { BaseProtocol, type ProtocolType, type ProtocolQuote, type QuoteParams } from "../base-protocol";
import type { Transaction } from "../../types/execution";
import type { RPCProviderManager } from "../../../shared/rpc/provider-manager";
import type { Address } from "../../../types/common";
import { decodeFunctionResult } from "viem";

const ERC20_APPROVE_SIG = "0x095ea7b3"; // approve(address,uint256)
const AAVE_SUPPLY_SIG = "0x617ba037"; // supply(address,uint256,address,uint16)
const AAVE_WITHDRAW_SIG = "0x69328dec"; // withdraw(address,uint256,address)

const AAVE_DATA_PROVIDER_ABI = [{
    "inputs": [{ "internalType": "address", "name": "asset", "type": "address" }],
    "name": "getReserveData",
    "outputs": [
        { "internalType": "uint256", "name": "unbacked", "type": "uint256" },
        { "internalType": "uint256", "name": "accruedToTreasuryScaled", "type": "uint256" },
        { "internalType": "uint256", "name": "totalAToken", "type": "uint256" },
        { "internalType": "uint256", "name": "totalStableDebt", "type": "uint256" },
        { "internalType": "uint256", "name": "totalVariableDebt", "type": "uint256" },
        { "internalType": "uint256", "name": "liquidityRate", "type": "uint256" },
        { "internalType": "uint256", "name": "variableBorrowRate", "type": "uint256" },
        { "internalType": "uint256", "name": "stableBorrowRate", "type": "uint256" },
        { "internalType": "uint256", "name": "averageStableBorrowRate", "type": "uint256" },
        { "internalType": "uint256", "name": "liquidityIndex", "type": "uint256" },
        { "internalType": "uint256", "name": "variableBorrowIndex", "type": "uint256" },
        { "internalType": "uint40", "name": "lastUpdateTimestamp", "type": "uint40" }
    ],
    "stateMutability": "view",
    "type": "function"
}] as const;

export class AaveProtocol extends BaseProtocol {
    readonly name = "aave";
    readonly type: ProtocolType = "lending";
    readonly supportedChains = [1, 137, 42161]; // Aave v3 networks

    constructor(
        /** Used for on-chain getReserveData calls to fetch APY */
        private readonly rpcProviderManager: RPCProviderManager,
        /** Map of chainId -> Aave Pool contract address */
        private readonly poolAddress: Record<number, Address>,
        /** Map of chainId -> Aave PoolDataProvider contract address */
        private readonly dataProviderAddress: Record<number, Address>,
    ) {
        super();
    }

    /**
     * Check if chain is supported and configured.
     */
    supports(chainId: number): boolean {
        return this.supportedChains.includes(chainId) && !!this.poolAddress[chainId] && !!this.dataProviderAddress[chainId];
    }

    /**
     * Aave supply is 1:1, fee is just gas.
     */
    async quote(params: QuoteParams): Promise<ProtocolQuote> {
        return {
            inputAmount: params.amount,
            outputAmount: params.amount,
            fee: 0n, // Protocol fee is 0, user pays gas when executing Tx
            estimatedTimeMs: 15_000,
            priceImpact: 0,
            protocolName: this.name,
        };
    }

    /**
     * Build supply transaction(s).
     * Retrieves two transactions: ERC-20 Approve + Aave supply()
     */
    async buildTransaction(quote: ProtocolQuote, params: QuoteParams): Promise<Transaction[]> {
        const chainId = params.fromChain;
        const pool = this.poolAddress[chainId];
        if (!pool) throw new Error(`Aave not configured for chain ${chainId}`);

        // Mocking ABI encoding for simplicity. In prod use ethers.Interface
        const paddedAmt = params.amount.toString(16).padStart(64, "0");
        const paddedPool = pool.replace("0x", "").padStart(64, "0");

        const approveData = `${ERC20_APPROVE_SIG}${paddedPool}${paddedAmt}`;

        const paddedAsset = params.token.replace("0x", "").padStart(64, "0");
        const paddedOnBehalfOf = (params.recipient || "0x0000000000000000000000000000000000000000").replace("0x", "").padStart(64, "0");
        const paddedReferral = "0".padStart(64, "0");

        const supplyData = `${AAVE_SUPPLY_SIG}${paddedAsset}${paddedAmt}${paddedOnBehalfOf}${paddedReferral}`;

        return [
            {
                to: params.token as Address, // Target the ERC20 contract
                data: approveData,
                value: "0",
                chainId,
                gasLimit: "50000",
            },
            {
                to: pool, // Target the Aave Pool
                data: supplyData,
                value: "0",
                chainId,
                gasLimit: "250000",
            }
        ];
    }

    /**
     * Query the current APY for supplying a specific token on a chain.
     */
    async getAPY(token: string, chainId: number): Promise<number> {
        if (!this.supports(chainId)) {
            throw new Error(`Aave not supported/configured for chain ${chainId}`);
        }

        const dataProvider = this.dataProviderAddress[chainId];
        const provider = this.rpcProviderManager.getProvider(chainId);

        // Function signature: getReserveData(address asset) -> 0x35ea6a75
        const functionSelector = "0x35ea6a75";
        const paddedToken = token.toLowerCase().replace("0x", "").padStart(64, "0");
        const calldata = `${functionSelector}${paddedToken}`;

        try {
            const result = await provider.call(
                dataProvider as `0x${string}`,
                calldata
            );

            if (!result || result === "0x") {
                // Token has no reserve data on Aave for this chain
                throw new Error("Empty response from Aave Data Provider — probably unsupported token");
            }

            // Decode the massive tuple using viem
            const decoded = decodeFunctionResult({
                abi: AAVE_DATA_PROVIDER_ABI,
                functionName: "getReserveData",
                data: result as `0x${string}`,
            });

            // decoded is an array (or object if named) of the tuple. 
            // the 6th element (index 5) is liquidityRate (APR in ray) as per ABI outputs.
            const liquidityRateRay = BigInt(decoded[5]);

            if (liquidityRateRay === 0n) return 0; // No liquidity

            // Convert liquidityRate (APR in ray) to APY
            const RAY = 1e27;
            const SECONDS_PER_YEAR = 31536000;
            const depositAPR = Number(liquidityRateRay) / RAY;

            // Compound interest formula: APY = (1 + APR / SECONDS_PER_YEAR) ^ SECONDS_PER_YEAR - 1
            const apy = (Math.pow(1 + depositAPR / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;

            return apy;
        } catch (error: any) {
            if (error.message.includes("execution reverted")) {
                // Aave PoolDataProvider reverts if the token is not an active reserve
                return 0;
            }
            console.error(`[Aave] Failed to fetch APY for ${token} on chain ${chainId}:`, error.message);
            throw new Error(`Failed to fetch APY from Aave: ${error.message}`);
        }
    }

    /**
     * Helper to build a withdraw transaction.
     */
    async buildWithdraw(token: string, amount: bigint, chainId: number, toAddress: string): Promise<Transaction> {
        const pool = this.poolAddress[chainId];
        if (!pool) throw new Error(`Aave not configured for chain ${chainId}`);

        const paddedAsset = token.replace("0x", "").padStart(64, "0");
        const paddedAmt = amount.toString(16).padStart(64, "0");
        const paddedTo = toAddress.replace("0x", "").padStart(64, "0");

        const withdrawData = `${AAVE_WITHDRAW_SIG}${paddedAsset}${paddedAmt}${paddedTo}`;

        return {
            to: pool,
            data: withdrawData,
            value: "0",
            chainId,
            gasLimit: "250000",
        };
    }
}
