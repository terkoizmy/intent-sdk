# Developer Setup Guide

This guide will walk you through setting up a brand-new Node.js/TypeScript project and integrating the **Intent Parser SDK** from scratch. 

By the end of this guide, you will have a working script that can parse natural English and execute cross-chain intents using an autonomous solver.

---

## 🚀 Step 1: Initialize a New Project

First, create a new directory for your project and initialize it. We recommend using **Bun** or **npm** with TypeScript.

```bash
mkdir my-intent-app
cd my-intent-app

# Initialize project
bun init -y
# OR: npm init -y
```

Install TypeScript and run-time executors if you haven't already:

```bash
npm install -D typescript tsx @types/node
npx tsc --init
```

Update your `tsconfig.json` to ensure modern module resolution:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 📦 Step 2: Install the Intent SDK

Install the SDK and `dotenv` for environment variable management.

```bash
bun add @terkoizmy/intent-sdk dotenv
# OR: npm install @terkoizmy/intent-sdk dotenv
```

---

## 🔐 Step 3: Configure Environment Variables

The SDK requires a solver wallet and network RPC URLs to function in live mode.

Create a `.env` file in the root of your project:

```bash
touch .env
```

Add the following configuration (replace with your actual private key and API keys):

```env
# 1. Your Solver Wallet Private Key (Must include 0x prefix)
# WARNING: Use a fresh test wallet for development! Do NOT use your main net wallet.
SOLVER_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# 2. RPC Endpoints (for testnets)
# We will use Unichain Sepolia and Base Sepolia as our test networks
UNICHAIN_SEPOLIA_RPC_URL=https://sepolia.unichain.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 3. Settlement Contract Address (Deployed on your primary chain)
# See DEPLOYMENT.md if you haven't deployed one yourself.
SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA=0x7066f6dFc1C652c165Bc9BB10085fD95719b5eA6
```

---

## ⌨️ Step 4: Write Your First Intent Script

Create a new file named `index.ts`:

```bash
touch index.ts
```

Copy the following code into `index.ts`. This script will:
1. Initialize the SDK in Simulate Mode.
2. Parse a natural English string completely offline.
3. Use the solver to price and process the extracted order.

```typescript
import { createIntentSDK } from "@terkoizmy/intent-sdk";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
    console.log("🚀 Initializing Intent SDK...");

    // 1. Create both Parser and Solver via the SDK Factory
    const { parser, solver } = createIntentSDK({
        solver: {
            agent: {
                privateKey: process.env.SOLVER_PRIVATE_KEY!,
                // Use "simulate" for local testing without spending gas
                // Use "live" for actual on-chain execution
                mode: "simulate",
                supportedChains: [1301, 84532], // Unichain Sepolia, Base Sepolia
                supportedTokens: ["USDC"],
            },
            contractAddress: process.env.SETTLEMENT_CONTRACT_UNICHAIN_SEPOLIA!,
            rpcUrls: {
                1301: process.env.UNICHAIN_SEPOLIA_RPC_URL!,
                84532: process.env.BASE_SEPOLIA_RPC_URL!,
            }
        }
    });

    // 2. Initialize the solver (Loads async data like token balances)
    await solver.initialize();
    
    console.log("✅ Solver initialized and ready.");

    // 3. User input in natural language
    const userPrompt = "Bridge 150 USDC from Unichain Sepolia to Base Sepolia";
    console.log(`\n💬 User says: "${userPrompt}"`);

    // 4. Parse the natural language intent
    const parseResult = parser.parse(userPrompt);
    
    if (!parseResult.success) {
        throw new Error(`Failed to parse target: ${parseResult.error}`);
    }

    const parsedIntent = parseResult.data!;
    console.log("\n🧠 Parser understood:");
    console.dir(parsedIntent, { depth: null });

    // 5. Build a solver intent (wrap parser result into a signed system intent)
    // Normally, this comes from an API or mempool. We mock it here.
    const intentId = "0x" + Math.random().toString(16).slice(2).padStart(64, '0');
    
    const solverIntent = {
        intentId: intentId,
        intentHash: intentId, // simplified for example
        user: "0xYourUserWalletAddressMock", 
        signature: "0xMockSignature",
        deadline: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiration
        status: "pending" as const,
        receivedAt: Date.now(),
        parsedIntent: parsedIntent
    };

    // 6. Check if solver can accept and process this intent
    if (!solver.canSolve(solverIntent)) {
        console.log("\n❌ Solver cannot process this intent. (Check inventory or unsupported chain)");
        return;
    }

    // 7. Get a fee quote
    const quote = solver.getQuote(solverIntent);
    console.log("\n💰 Fee Pricing:");
    console.log(`Base Fee: ${quote.baseFee} wei`);
    console.log(`Estimated Gas Cost: ${quote.gasCost} wei`);
    console.log(`Total Deducted File: ${quote.totalFee} wei`);
    console.log(`Solver Profit: ${quote.solverProfit} wei`);
    console.log(`Inventory Scarcity Multiplier: ${quote.inventoryMultiplier}x`);

    console.log("\n⚡ Executing Solve Lifecycle...");
    
    try {
        // 8. Execute the intent
        const result = await solver.solve(solverIntent);
        
        if (result.success) {
            console.log("🎉 Intent Successfully Solved!");
            console.log(`Target Chain TX Hash: ${result.txHash}`);
            console.log(`Secured Profit: ${result.profit} wei`);
        } else {
            console.error("⚠️ Solve execution failed gracefully:", result.error);
        }
    } catch (error) {
        console.error("🚨 Critical Solve Exception:", error);
    }
}

main().catch(console.error);
```

---

## 🏃 Step 5: Run Your Script

Now execute your script using `tsx` or `bun`:

```bash
npx tsx index.ts
# OR: bun index.ts
```

You should see output similar to this:
```
🚀 Initializing Intent SDK...
✅ Solver initialized and ready.

💬 User says: "Bridge 150 USDC from Unichain Sepolia to Base Sepolia"

🧠 Parser understood:
{
  intentType: 'bridge',
  parameters: {
    inputAmount: '150',
    inputToken: 'USDC',
    sourceChain: 1301,
    targetChain: 84532
  },
  constraints: { maxSlippage: 50 },
  metadata: { confidence: 0.95, ... }
}

...
🎉 Intent Successfully Solved!
Target Chain TX Hash: 0x...
```

---

## ⏭️ Next Steps

Congratulations! You have successfully built your first parsing and solving tool. 

Now you can explore deeper:
1. Try changing the script mode from `"simulate"` to **`"live"`** out to execute real token transfers (Ensure you have testnet ETH and USDC first! See [TESTNET_GUIDE.md](./TESTNET_GUIDE.md)).
2. Connect to an intent queue by reading the [Autonomous Mode via Mempool](./USAGE.md#-autonomous-mode--mempool-listener) section.
3. Add Custom Chains support by reading the [Adding Custom Chains](./USAGE.md#-adding-custom-chains) section.
4. Deploy your own Settler contract by following [DEPLOYMENT.md](./DEPLOYMENT.md).
