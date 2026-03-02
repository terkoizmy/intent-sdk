import { ethers, Contract, ContractTransactionResponse } from "ethers";
// import { CrossChainOrder, IntentStatus } from "../../types/intent";
export interface CrossChainOrder {
    settlementContract: string;
    swapper: string;
    nonce: bigint;
    originChainId: number;
    initiateDeadline: number;
    fillDeadline: number;
    orderData: string;
}
// import { IntentSettlement } from "../../../contracts/typechain-types"; // Type-only import if available, else omit


// Human-Readable ABI for IntentSettlement
const INTENT_SETTLEMENT_ABI = [
    "function open(tuple(address settlementContract, address swapper, uint256 nonce, uint32 originChainId, uint32 initiateDeadline, uint32 fillDeadline, bytes orderData) order, bytes signature, bytes orderData) external",
    "function claim(tuple(address settlementContract, address swapper, uint256 nonce, uint32 originChainId, uint32 initiateDeadline, uint32 fillDeadline, bytes orderData) order, bytes signature) external",
    "function refund(tuple(address settlementContract, address swapper, uint256 nonce, uint32 originChainId, uint32 initiateDeadline, uint32 fillDeadline, bytes orderData) order) external",
    "function isIntentSettled(bytes32 intentId) view returns (bool)",
    "event FundsLocked(bytes32 indexed intentId, address indexed swapper, address token, uint256 amount)",
    "event FundsClaimed(bytes32 indexed intentId, address indexed solver, uint256 amount)",
    "event FundsRefunded(bytes32 indexed intentId, address indexed swapper, uint256 amount)"
];

export class IntentSettlementContract {
    private contract: Contract;

    constructor(address: string, providerOrSigner: ethers.Provider | ethers.Signer) {
        this.contract = new Contract(address, INTENT_SETTLEMENT_ABI, providerOrSigner);
    }

    updateSigner(signer: ethers.Signer) {
        this.contract = new Contract(this.contract.target, INTENT_SETTLEMENT_ABI, signer);
    }

    async open(order: CrossChainOrder, signature: string, orderData: string): Promise<ContractTransactionResponse> {
        return await this.contract.open(order, signature, orderData);
    }

    async claim(order: CrossChainOrder, oracleSignature: string): Promise<ContractTransactionResponse> {
        return await this.contract.claim(order, oracleSignature);
    }

    async refund(order: CrossChainOrder): Promise<ContractTransactionResponse> {
        return await this.contract.refund(order);
    }

    async isSettled(intentId: string): Promise<boolean> {
        return await this.contract.isIntentSettled(intentId);
    }

    async waitForLockEvent(intentId: string, timeoutMs: number = 60000): Promise<boolean> {
        // Basic polling or event listener logic
        const topic = this.contract.interface.getEvent("FundsLocked")!.topicHash;
        const filter = {
            address: await this.contract.getAddress(),
            topics: [topic, intentId]
        };

        const provider = this.contract.runner?.provider;
        if (!provider) throw new Error("No provider available");

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.contract.removeAllListeners(filter as any);
                resolve(false);
            }, timeoutMs);

            this.contract.once(filter as any, () => {
                clearTimeout(timeout);
                resolve(true);
            });
        });
    }

    getAddress(): Promise<string> {
        return this.contract.getAddress();
    }
}
