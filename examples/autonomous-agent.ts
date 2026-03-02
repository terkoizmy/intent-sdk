import { createIntentSDK } from "../src";

async function main() {
    console.log("-----------------------------------------");
    console.log("Example 2: Autonomous Agent (Phase K)");
    console.log("-----------------------------------------");

    // 1. Initialize SDK
    console.log("Initializing Intent SDK in Autonomous Mode...");
    const sdk = createIntentSDK({
        agent: {
            privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Hardhat account #1
            mode: "simulate",
            supportedChains: [1, 10, 42161],
            supportedTokens: ["USDT"]
        },
        contractAddress: "0x0000000000000000000000000000000000000000"
    } as any);

    await sdk.solver.initialize();

    // 2. Start Mempool listener
    const mempoolUrl = "wss://placeholder.mempool.local"; // Placeholder URL
    console.log(`\nConnecting to Mempool at ${mempoolUrl}...`);
    sdk.solver.start(mempoolUrl);

    console.log("Agent is now listening for incoming intents...");
    console.log("Current Agent Status:", sdk.solver.getStatus());

    // 3. Keep process alive and print stats periodically
    let count = 0;
    const interval = setInterval(() => {
        count++;
        const stats = sdk.solver.getStats();
        console.log(`\n[Agent Heartbeat ${count}] Stats Tracker:`);
        console.log(`- Intents Received: ${stats.mempoolStats.received}`);
        console.log(`- Intents Filtered: ${stats.mempoolStats.filtered}`);
        console.log(`- Intents Solved: ${stats.mempoolStats.solved}`);
        console.log(`- Solves Failed: ${stats.mempoolStats.failed}`);
        console.log(`- Total Profit: ${stats.profitStats.totalProfit} wei`);

        if (count >= 5) { // Stop after 5 ticks for the example
            console.log("\nStopping autonomous agent for demonstration purposes.");
            sdk.solver.stop();
            console.log("Agent Status:", sdk.solver.getStatus());
            clearInterval(interval);
        }
    }, 2000); // 2 second ticks
}

main().catch(console.error);
