/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║             Intent Parser SDK — Usage Examples              ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Run:  bun run examples/basic-usage.ts                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Available Functions:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ IntentParser (main class)                                    │
 * │  .parse(text)           → ParseResult   (sync)               │
 * │  .parseAsync(text)      → Promise<ParseResult> (with token   │
 * │                           address resolution via Swing API)  │
 * │  .parseBatch(texts[])   → ParseResult[] (sync batch)         │
 * │  .parseBatchAsync(texts[]) → Promise<ParseResult[]>          │
 * ├───────────────────────────────────────────────────────────────┤
 * │ Individual Extractors (for advanced / custom usage)          │
 * │  AmountExtractor.extract(text)     → AmountEntity[]          │
 * │  TokenExtractor.extract(text)      → TokenEntity[]           │
 * │  ActionExtractor.extract(text)     → ActionEntity[]          │
 * │  ConstraintExtractor.extract(text) → ConstraintEntity[]      │
 * │  IntentClassifier.classify(text)   → IntentType              │
 * ├───────────────────────────────────────────────────────────────┤
 * │ IntentSDK (high-level orchestrator — future solver)          │
 * │  .parser          → IntentParser instance                    │
 * │  .solve(text)     → Promise<ParseResult> (parse + solve)     │
 * └───────────────────────────────────────────────────────────────┘
 *
 * Supported Intent Types:
 *   swap | yield_strategy | nft_purchase | send | bridge | claim | unknown
 */

import { IntentParser } from "@terkoizmy/intent-sdk";
import { IntentClassifier } from "../src/parser/classifiers/intent-classifier";
import { AmountExtractor } from "../src/parser/extractors/amount";
import { TokenExtractor } from "../src/parser/extractors/token";
import { ActionExtractor } from "../src/parser/extractors/action";
import { ConstraintExtractor } from "../src/parser/extractors/constraints";
import { createIntentSDK } from "@terkoizmy/intent-sdk";

// ─── Helper ─────────────────────────────────────────
function log(title: string, data: unknown) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
  console.log(JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════
// 1. BASIC SETUP — IntentParser with config
// ═══════════════════════════════════════════════════════
const parser = new IntentParser({
  // Default deadline offset in seconds (default: 3600 = 1 hour)
  defaultDeadlineOffset: 3600,

  // Pre-load known token addresses for instant resolution (no API call needed)
  knownTokens: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },

  // Confidence threshold (results below this are still returned but can be filtered)
  minConfidence: 0.5,

  // Token Resolver — enable for parseAsync() to resolve addresses via Swing.xyz API
  // tokenResolver: { enabled: true, cacheTTL: 300_000, timeout: 5000 },
});

// ═══════════════════════════════════════════════════════
// 2. SWAP — "Swap 1000 USDC to ETH"
// ═══════════════════════════════════════════════════════
log("2. Swap Intent", parser.parse("Swap 1000 USDC to ETH on Polygon"));
// Result:
//   intentType: "swap"
//   parameters: { inputToken: "USDC", outputToken: "ETH", inputAmount: "1000", sourceChain: "Polygon" }
//   constraints: { deadline: ..., maxSlippage: undefined }
//   metadata:  { confidence: ~0.9, originalText: "..." }

// ═══════════════════════════════════════════════════════
// 3. SWAP with constraints — slippage + deadline
// ═══════════════════════════════════════════════════════
log(
  "3. Swap with Constraints",
  parser.parse("Swap 10k USDC to ETH with max 0.5% slippage"),
);
// inputAmount: "10000" (k suffix parsed)
// constraints.maxSlippage: 50  (0.5% = 50 basis points)

// ═══════════════════════════════════════════════════════
// 4. YIELD STRATEGY — risk detection + diversification
// ═══════════════════════════════════════════════════════
log(
  "4. Yield Strategy (safe + diversify)",
  parser.parse(
    "I want to maximize my yield on 10k USDC, keep it safe and split across multiple protocols",
  ),
);
// intentType: "yield_strategy"
// parameters: { inputToken: "USDC", inputAmount: "10000", riskLevel: "low", diversificationRequired: true }

log(
  "4b. Yield Strategy (degen)",
  parser.parse("Degen farm 5000 ETH for highest APY"),
);
// riskLevel: "high"

// ═══════════════════════════════════════════════════════
// 5. NFT PURCHASE — collection detection via aliases
// ═══════════════════════════════════════════════════════
log(
  "5. NFT Purchase",
  parser.parse("Buy a BAYC NFT with max 10 ETH"),
);
// intentType: "nft_purchase"
// parameters: { collection: "Bored Ape Yacht Club", maxPrice: "10", inputToken: "ETH" }

// ═══════════════════════════════════════════════════════
// 6. SEND — address / ENS detection
// ═══════════════════════════════════════════════════════
log(
  "6. Send to ENS",
  parser.parse("Send 100 USDC to vitalik.eth"),
);
// intentType: "send"
// parameters: { inputToken: "USDC", inputAmount: "100", recipient: "vitalik.eth" }

log(
  "6b. Send to 0x address",
  parser.parse("Transfer 0.5 ETH to 0x1234567890abcdef1234567890abcdef12345678"),
);
// parameters.recipient: "0x1234567890abcdef1234567890abcdef12345678"

// ═══════════════════════════════════════════════════════
// 7. BRIDGE — cross-chain transfers
// ═══════════════════════════════════════════════════════
log(
  "7. Bridge",
  parser.parse("Bridge 500 USDC from Ethereum to Arbitrum"),
);
// intentType: "bridge"
// parameters: { inputToken: "USDC", inputAmount: "500", sourceChain: "Ethereum", targetChain: "Arbitrum" }

log(
  "7b. Cross-chain syntax",
  parser.parse("Cross-chain transfer 100 USDC to Polygon"),
);

// ═══════════════════════════════════════════════════════
// 8. CLAIM — airdrop, rewards, vesting
// ═══════════════════════════════════════════════════════
log("8a. Claim Airdrop", parser.parse("Claim my ARB airdrop"));
// parameters: { inputToken: "ARB", claimType: "airdrop" }

log("8b. Claim Rewards", parser.parse("Claim staking rewards from Lido"));
// parameters: { claimType: "rewards", protocol: "lido" }

log("8c. Claim Vesting", parser.parse("Claim 500 vested ARB tokens"));
// parameters: { inputToken: "ARB", inputAmount: "500", claimType: "vesting" }

// ═══════════════════════════════════════════════════════
// 9. UNKNOWN INTENT — graceful fallback
// ═══════════════════════════════════════════════════════
log("9. Unknown Intent", parser.parse("What's the weather today?"));
// intentType: "unknown"
// confidence: ~0.1

// ═══════════════════════════════════════════════════════
// 10. BATCH PARSING — parse multiple texts at once
// ═══════════════════════════════════════════════════════
log(
  "10. Batch Parsing",
  parser.parseBatch([
    "Swap 100 USDC to ETH",
    "Stake 5 ETH",
    "Bridge 1000 DAI from Ethereum to Polygon",
    "Send 0.1 ETH to alice.eth",
    "Claim my UNI airdrop",
  ]),
);

// ═══════════════════════════════════════════════════════
// 11. INDIVIDUAL EXTRACTORS — use standalone
// ═══════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log("  11. Individual Extractors (Advanced Usage)");
console.log(`${"═".repeat(60)}`);

const text = "Swap 10k USDC to ETH with max 1% slippage within 1 hour";

// 11a. Classify intent
const classifier = new IntentClassifier();
console.log("\n  Intent Type:", classifier.classify(text));

// 11b. Extract amounts
const amountExtractor = new AmountExtractor();
console.log("  Amounts:", amountExtractor.extract(text));

// 11c. Extract tokens
const tokenExtractor = new TokenExtractor({
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
});
console.log("  Tokens:", tokenExtractor.extract(text));

// 11d. Extract actions
const actionExtractor = new ActionExtractor();
console.log("  Actions:", actionExtractor.extract(text));

// 11e. Extract constraints
const constraintExtractor = new ConstraintExtractor();
console.log("  Constraints:", constraintExtractor.extract(text));

// ═══════════════════════════════════════════════════════
// 12. ASYNC PARSING — with token address resolution
// ═══════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log("  12. Async Parsing (Token Address Resolution)");
console.log(`${"═".repeat(60)}`);

// Enable token resolver for async parsing
const asyncParser = new IntentParser({
  knownTokens: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  tokenResolver: {
    enabled: true,
    cacheTTL: 300_000,
    timeout: 5000,
    maxCacheSize: 1000
  },
});

(async () => {
  // parseAsync resolves token addresses via Swing.xyz API
  const result = await asyncParser.parseAsync("Swap 100 USDC to ETH");
  console.log("\n  parseAsync result:", JSON.stringify(result, null, 2));
  // parameters.inputTokenAddress & outputTokenAddress will be populated

  // Batch async
  const batchResults = await asyncParser.parseBatchAsync([
    "Swap 50 DAI to WBTC",
    "Bridge 100 USDC from Ethereum to Polygon",
  ]);
  console.log("\n  parseBatchAsync results:", JSON.stringify(batchResults, null, 2));
})();

// ═══════════════════════════════════════════════════════
// 13. IntentSDK — high-level orchestrator
// ═══════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log("  13. IntentSDK (High-Level Orchestrator)");
console.log(`${"═".repeat(60)}`);

const { parser: sdkParser, solver } = createIntentSDK({
  solver: {
    agent: {
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // dummy
      mode: "simulate",
      supportedChains: [1, 42161],
      supportedTokens: ["USDC"]
    },
    contractAddress: "0x0000000000000000000000000000000000000000"
  } as any
});

(async () => {
  const result = sdkParser.parse("Swap 1000 USDC to ETH");
  console.log("\n  SDK parse result:", JSON.stringify(result, null, 2));
})();
