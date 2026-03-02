import { createIntentSDK } from "../src";
import { Rebalancer } from "../src/solver/inventory/rebalancer";

async function main() {
    console.log("-----------------------------------------");
    console.log("Example 3: Inventory Management (Phase K)");
    console.log("-----------------------------------------");

    // 1. Initialize SDK
    console.log("Initializing Intent SDK for Inventory Tracking...");
    const sdk = createIntentSDK({
        agent: {
            privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            mode: "simulate",
            supportedChains: [1, 10, 42161],
            supportedTokens: ["USDC"]
        },
        contractAddress: "0x0000000000000000000000000000000000000000"
    } as any);

    await sdk.solver.initialize();

    // 2. Print initial balances
    console.log("\nFetching Inventory Snapshot...");
    const snapshot = sdk.solver.inventoryManager.getSnapshot();
    console.log("Timestamp:", new Date(snapshot.timestamp).toISOString());
    console.log("Total Estimated Value (USD):", snapshot.totalValueUsd);

    console.log("\nChain Breakdown:");
    for (const [key, balance] of Object.entries(snapshot.balances)) {
        console.log(`- [${key}] Available: ${(balance as any).available} | Locked: ${(balance as any).locked}`);
    }

    // 3. Create a Rebalancer manually to show cross-chain rebalancing logic
    // We pass a dummy bridge protocol
    console.log("\nChecking Rebalancing Needs...");
    const dummyBridgeProtocol = {
        name: "DummyBridge",
        bridge: async (amount: bigint, _token: string, source: number, target: number) => {
            console.log(`[DummyBridge] Instructed to bridge ${amount} from chain ${source} to chain ${target}`);
            return "dummy-tx-hash";
        }
    };

    const rebalancer = new Rebalancer(
        sdk.solver.inventoryManager,
        dummyBridgeProtocol as any,
        {
            targetPercentage: 0.33,   // Want ~33% on each of the 3 chains
            thresholdPercentage: 0.1, // Rebalance if difference > 10%
            minRebalanceAmount: 100n
        } as any,
        "0xAgentAddress"
    );

    const needsRebalance = rebalancer.needsRebalancing("USDC");
    if (needsRebalance) {
        console.log("Rebalancing is required to maintain optimal distribution.");
        // We won't actually execute the rebalance in the mock
        // await rebalancer.execute("USDC");
    } else {
        console.log("Inventory is well-balanced across supported chains.");
    }
}

main().catch(console.error);
