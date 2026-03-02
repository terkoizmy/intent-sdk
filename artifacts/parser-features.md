# Intent SDK Features

This document details the features and capabilities of the `intent-parser-sdk`. The parser extracts structured intents from natural language for DeFi operations.

## 1. Core Architecture

The parser operates in a pipeline:
1.  **Normalization**: Cleans input (whitespace, smart quotes, case).
2.  **Classification**: Identifies intent type (e.g., `swap`, `bridge`) using keyword patterns.
3.  **Extraction**: Extractors identify specific entities (amounts, tokens, actions, constraints).
4.  **Templating**: Maps entities to the detected intent's schema.
5.  **Construction**: Builds the final object, applying defaults and calculating confidence.
6.  **Resolution (Async)**: Resolves token symbols to contract addresses via API (Phase 3).

## 2. Supported Intent Types

| Intent Type | Triggers | Parameters | Example |
| :--- | :--- | :--- | :--- |
| **Swap** | `swap`, `trade`, `exchange`, `convert` | `inputToken`, `outputToken`, `inputAmount`, `sourceChain` | "Swap 100 USDC to ETH" |
| **Yield Strategy** | `yield`, `stake`, `earn`, `apy`, `farm` | `inputToken`, `inputAmount`, `riskLevel`, `diversificationRequired` | "Maximize yield on 10k USDC" |
| **NFT Purchase** | `buy nft`, `mint`, `purchase list` | `collection`, `maxPrice`, `inputToken` | "Buy BAYC NFT with 10 ETH" |
| **Send** | `send`, `transfer`, `pay` | `inputToken`, `inputAmount`, `recipient` | "Send 50 USDC to vitalik.eth" |
| **Bridge** | `bridge`, `cross-chain` | `inputToken`, `inputAmount`, `sourceChain`, `targetChain` | "Bridge USDC from Eth to Arb" |
| **Claim** | `claim`, `collect`, `withdraw reward` | `inputToken`, `claimType`, `protocol` | "Claim my ARB airdrop" |

## 3. Extraction Features

### 3.1. Amount Extraction
*   **Integers & Decimals**: `100`, `0.5`, `10.5`
*   **Suffix Support**: `10k` (10,000), `1.5m` (1,500,000)
*   **Context Awareness**: Associates amounts with adjacent tokens.

### 3.2. Token Extraction
*   **Fungible Tokens**: `USDC`, `ETH`, `WBTC`, `DAI`
*   **NFT Collections**: Supports names (`Bored Ape Yacht Club`) and aliases (`BAYC`, `Pudgy`).
*   **Filtering**: Ignores common words (`TO`, `FROM`, `WITH`, `NFT`, `SWAP`) to prevent false positives.

### 3.3. Constraints
*   **Slippage**: `max 1% slippage`, `0.5% slippage`
*   **Deadline**: `within 1 hour`, `in 30 mins` (converted to seconds)
*   **Gas**: `gas cost 0.01 ETH`

### 3.4. Chain & Address Detection
*   **Addresses**: Validates `0x...` addresses (32-42 chars).
*   **ENS**: Validates names ending in `.eth`.
*   **Chains**: Detects `on Polygon`, `to Arbitrum`, `from Ethereum`, etc.

## 4. Advanced Capabilities

### 4.1. Confidence Scoring
Returns a `confidence` score (0-1) based on:
*   ✓ Presence of required fields
*   ✓ Presence of optional fields
*   ✓ Resolution of token addresses
*   ✓ Explicit chain mentions

### 4.2. Async Token Resolution
*   **Function**: `parser.parseAsync(text)`
*   **Capabilities**:
    *   Resolves symbols (`USDC`) to addresses (`0xA0b8...`)
    *   Uses external API (simulated/Swing.xyz)
    *   Caches results to minimize latency
    *   Validation warnings if resolution fails

### 4.3. Batch Parsing
*   **Function**: `parser.parseBatch(texts)`
*   **Usage**: Process arrays of inputs efficiently.

### 4.4. Configurability
All aspects can be tuned via `ParserConfig`:
*   `defaultDeadlineOffset`: Default duration for deadlines
*   `knownTokens`: Pre-loaded token map
*   `minConfidence`: Threshold for validity
*   `tokenResolver`: API settings for address resolution

## 5. Usage Example

```typescript
import IntentParser from "./index";

const parser = new IntentParser();

// Sync Parse
const result = parser.parse("Swap 100 USDC to ETH");
console.log(result.data);

// Async Parse (with address resolution)
const resultAsync = await parser.parseAsync("Swap 100 USDC to ETH");
console.log(resultAsync.data.parameters.inputTokenAddress);
```
