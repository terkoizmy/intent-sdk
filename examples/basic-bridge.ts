import { createIntentSDK } from "@terkoizmy/intent-sdk";

async function main() {
    console.log("-----------------------------------------");
    console.log("Example 1: Basic Bridge Flow (Phase K)");
    console.log("-----------------------------------------");

    // 1. Initialize SDK
    console.log("Initializing Intent SDK...");
    const sdk = createIntentSDK({
        solver: {
            agent: {
                name: "Demo Agent",
                privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Hardhat account #0 for demo
                mode: "simulate", // Use simulate to avoid actual RPC calls for this example
                supportedChains: [1, 10, 42161],
                supportedTokens: ["USDC"]
            },
            contractAddress: "0x0000000000000000000000000000000000000000" // Not used in simulate
        } as any
    });

    // Need to initialize asynchronous state (load balances, though mocked in simulate)
    await sdk.solver.initialize();

    // 2. Parse text
    const text = "Bridge 100 USDC to Arbitrum immediately";
    console.log(`\nParsing Intent: "${text}"`);
    const parsedParams = await sdk.parser.parse(text);
    console.log("Parsed Parameters:", parsedParams);

    // Create a SolverIntent from the parsed params
    const intent = {
        intentId: "dummy-intent-" + Date.now(),
        creator: "0xUserAddress",
        parsedIntent: {
            intentType: "bridge" as const,
            parameters: parsedParams
        },
        deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    } as any; // Cast needed as we aren't using the full UUID strict signature for demo

    // 3. Get Quote
    console.log("\nGetting Quote from Solver Engine...");
    if (sdk.solver.canSolve(intent)) {
        const quote = sdk.solver.getQuote(intent);
        console.log("Pricing Quote:");
        console.log(`- Base Fee: ${quote.baseFee} wei`);
        console.log(`- Gas Cost: ${quote.gasCost} wei`);
        console.log(`- Slippage Capture: ${quote.slippageCapture} wei`);
        console.log(`- Total Fee: ${quote.totalFee} wei`);
        console.log(`- User Receives: ${quote.userReceives} wei`);
        console.log(`- Solver Profit: ${quote.solverProfit} wei`);

        // 4. Solve (Simulate)
        console.log("\nExecuting Solve (Simulate Mode)...");
        const result = await sdk.solver.solve(intent);

        if (result.success) {
            console.log("Solve Successful!");
            console.log("Simulated TX Hash:", result.txHash);
            console.log("Metadata:", result.metadata);
        } else {
            console.error("Solve Failed:", result.error);
        }
    } else {
        console.log("Solver cannot solve this intent (likely due to balance or unsupported chain in mocked config - expected for simulate unless balances are seeded)");
    }

    console.log("\nProcess complete.");
}

main().catch(console.error);
