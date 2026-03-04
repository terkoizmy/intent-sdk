/**
 * Calculate confidence score based on extracted entities
 *
 * INPUT: Extracted entities and intent type
 * OUTPUT: Confidence score (0-1)
 *
 * FACTORS:
 * - Number of required fields found
 * - Clarity of entities (no ambiguity)
 * - Pattern match strength
 */
export function calculateConfidence(
  parameters: Record<string, any>,
  template: any,
): number {
  if (!template) return 0;

  let score = 0.5; // Base score

  // 1. Penalty for unknown intent
  if (template.type === "unknown") {
    return 0.1;
  }

  // 2. Check required fields
  let requiredFieldsFound = 0;
  for (const field of template.requiredFields) {
    if (parameters[field] !== undefined && parameters[field] !== null) {
      requiredFieldsFound++;
    }
  }

  // Adjust score based on required fields coverage
  if (template.requiredFields.length > 0) {
    const coverage = requiredFieldsFound / template.requiredFields.length;
    // If all required fields are found, score starts high (0.8)
    // If half are missing, score drops to 0.5
    score = 0.4 + (coverage * 0.4);
  } else {
    // If no required fields, rely on entity presence but cap match
    score = 0.5;
  }

  // 3. Bonus for optional fields matches
  let optionalFieldsFound = 0;
  for (const field of template.optionalFields) {
    if (parameters[field] !== undefined) {
      optionalFieldsFound++;
    }
  }
  if (optionalFieldsFound > 0) {
    score += Math.min(0.1, optionalFieldsFound * 0.05);
  }

  // 4. Bonus for resolved token addresses (High confidence indicator)
  if (parameters.inputTokenAddress) score += 0.1;
  if (parameters.outputTokenAddress) score += 0.05;

  // 5. Bonus for explicit chain mention
  if (parameters.sourceChain) score += 0.05;

  // 6. Bonus for specific strategy details
  if (parameters.riskLevel) score += 0.05; // Yield strategy specific

  return Math.min(score, 1.0);
}

// Known DeFi protocols for claim detection
const KNOWN_PROTOCOLS = [
  "aave", "compound", "lido", "eigenlayer", "uniswap",
  "sushiswap", "curve", "convex", "rocket pool", "pendle",
  "aerodrome", "velodrome", "gmx", "radiant",
];

// Known chain aliases for bridge detection
const CHAIN_ALIASES: Record<string, string> = {
  'mainnet': 'Ethereum', 'ethereum': 'Ethereum',
  'polygon': 'Polygon', 'arbitrum': 'Arbitrum',
  'optimism': 'Optimism', 'base': 'Base',
  'avalanche': 'Avalanche', 'bsc': 'BSC',
  'bnb chain': 'BSC', 'solana': 'Solana',
};

/**
 * Merge entities into parameters
 *
 * INPUT: Extracted entities, intent type
 * OUTPUT: IntentParameters
 */
export function mergeEntities(entities: any, intentType: string, text?: string): any {
  const parameters: any = {};
  const lowerText = text?.toLowerCase() || "";

  // Map entities based on intent type strategies
  switch (intentType) {
    case 'swap':
      // Swap strategy: 
      // 1st amount -> inputAmount
      // 1st token -> inputToken
      // 2nd token -> outputToken
      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }
      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
        parameters.inputTokenAddress = entities.tokens[0].address;
      }
      if (entities.tokens.length > 1) {
        parameters.outputToken = entities.tokens[1].symbol;
        parameters.outputTokenAddress = entities.tokens[1].address;
      }

      // Check for chain override (e.g. "on Polygon")
      const chain = extractChain(lowerText);
      if (chain) {
        parameters.sourceChain = chain;
      }
      break;

    case 'yield_strategy':
      // Yield strategy:
      // 1st amount -> inputAmount
      // 1st token -> inputToken
      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }
      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
        parameters.inputTokenAddress = entities.tokens[0].address;
      }

      // Simple keyword analysis for risk
      if (lowerText.includes("safe") || lowerText.includes("low risk") || lowerText.includes("conservative")) {
        parameters.riskLevel = "low";
      } else if (lowerText.includes("degen") || lowerText.includes("high yield") || lowerText.includes("aggressive")) {
        parameters.riskLevel = "high";
      }

      if (lowerText.includes("diversify") || lowerText.includes("split") || lowerText.includes("multiple")) {
        parameters.diversificationRequired = true;
      }

      // Check for chain override
      const yieldChain = extractChain(lowerText);
      if (yieldChain) {
        parameters.sourceChain = yieldChain;
      }
      break;

    case 'nft_purchase':
      // NFT strategy:
      // 1st amount -> maxPrice
      // Collection detection — uses TokenExtractor's NFT collection results
      if (entities.amounts.length > 0) {
        parameters.maxPrice = entities.amounts[0].value.toString();
      }

      // Use TokenExtractor's collection detection (type === "collection")
      const nftCollections = entities.tokens.filter(
        (t: any) => t.type === "collection",
      );
      if (nftCollections.length > 0) {
        parameters.collection = nftCollections[0].symbol;
      }

      // Extract payment token (fungible tokens in the same text)
      const paymentTokens = entities.tokens.filter(
        (t: any) => t.type === "fungible",
      );
      if (paymentTokens.length > 0) {
        parameters.inputToken = paymentTokens[0].symbol;
        parameters.inputTokenAddress = paymentTokens[0].address;
      }

      break;

    case 'send':
      // Send strategy:
      // 1st token -> inputToken
      // 1st amount -> inputAmount
      // recipient -> detected via regex (0x address or .eth ENS)
      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
        parameters.inputTokenAddress = entities.tokens[0].address;
      }
      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }

      // Detect recipient address (0x...)
      const addressMatch = text?.match(/(?:to\s+)(0x[a-fA-F0-9]{40})/i);
      if (addressMatch) {
        parameters.recipient = addressMatch[1];
      } else {
        // Detect ENS name (*.eth)
        const ensMatch = text?.match(/(?:to\s+)([a-zA-Z0-9][a-zA-Z0-9-]*\.eth)/i);
        if (ensMatch) {
          parameters.recipient = ensMatch[1];
        }
      }

      // Check for chain override
      const sendChain = extractChain(lowerText);
      if (sendChain) {
        parameters.sourceChain = sendChain;
      }
      break;

    case 'bridge':
      // Bridge strategy:
      // 1st token -> inputToken
      // 1st amount -> inputAmount
      // Detect source/target chain from text keywords

      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
        parameters.inputTokenAddress = entities.tokens[0].address;
      }
      if (entities.tokens.length > 1) {
        parameters.outputToken = entities.tokens[1].symbol;
      }

      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }

      // Find all chain mentions in the text
      const chainNames = Object.keys(CHAIN_ALIASES).join('|');
      const chainRegex = new RegExp(`(?:from|to|on|in)?\\s*(${chainNames})\\b`, 'gi');

      const foundChains: string[] = [];
      let match;
      while ((match = chainRegex.exec(lowerText)) !== null) {
        const matched = match[1].toLowerCase();
        const chainName = CHAIN_ALIASES[matched] || matched.charAt(0).toUpperCase() + matched.slice(1);
        if (!foundChains.includes(chainName)) {
          foundChains.push(chainName);
        }
      }

      // Assign first found chain to source, second to target
      if (foundChains.length >= 1) {
        parameters.sourceChain = foundChains[0];
      }
      if (foundChains.length >= 2) {
        parameters.targetChain = foundChains[1];
      }

      // Fallback: strict "from/to" parsing to override if specific syntax is used
      const sourceMatch = lowerText.match(new RegExp(`from\\s+(${chainNames})`, 'i'));
      if (sourceMatch) {
        const matched = sourceMatch[1].toLowerCase();
        parameters.sourceChain = CHAIN_ALIASES[matched] || matched.charAt(0).toUpperCase() + matched.slice(1);
      }

      const targetMatch = lowerText.match(new RegExp(`to\\s+(${chainNames})`, 'i'));
      if (targetMatch && lowerText.indexOf("to " + targetMatch[1].toLowerCase()) > lowerText.indexOf("from ")) {
        // Only apply "to Chain" if it comes after "from", or if it's explicitly "to Chain"
        const matched = targetMatch[1].toLowerCase();
        parameters.targetChain = CHAIN_ALIASES[matched] || matched.charAt(0).toUpperCase() + matched.slice(1);
      }
      break;

    case 'claim':
      // Claim strategy:
      // 1st token -> inputToken (the token being claimed)
      // 1st amount (if any) -> inputAmount
      // Detect claimType from keywords: airdrop, rewards/staking, vesting
      // Detect protocol name from known protocols in text
      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
        parameters.inputTokenAddress = entities.tokens[0].address;
      }
      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }

      // Detect claim type from keywords
      if (lowerText.includes("airdrop")) {
        parameters.claimType = "airdrop";
      } else if (lowerText.includes("vest") || lowerText.includes("vesting")) {
        parameters.claimType = "vesting";
      } else if (
        lowerText.includes("reward") ||
        lowerText.includes("staking") ||
        lowerText.includes("earn")
      ) {
        parameters.claimType = "rewards";
      }

      // Detect protocol from known DeFi protocols
      for (const protocol of KNOWN_PROTOCOLS) {
        if (lowerText.includes(protocol)) {
          parameters.protocol = protocol;
          break;
        }
      }

      // Check for chain override
      const claimChain = extractChain(lowerText);
      if (claimChain) {
        parameters.sourceChain = claimChain;
      }
      break;

    default:
      // Generic fallback
      if (entities.amounts.length > 0) {
        parameters.inputAmount = entities.amounts[0].value.toString();
      }
      if (entities.tokens.length > 0) {
        parameters.inputToken = entities.tokens[0].symbol;
      }
  }

  return parameters;
}

/**
 * Extract chain name from text
 * Looks for "on [chain]" or just "[chain]" if unambiguous
 * 
 * INPUT: Lowercase text
 * OUTPUT: Normalized chain name or null
 */
function extractChain(lowerText: string): string | null {
  const chainNames = Object.keys(CHAIN_ALIASES).join('|');

  // Look for "on [chain]" pattern first (strong signal)
  const onMatch = lowerText.match(new RegExp(`(?:on|in)\\s+(${chainNames})`, 'i'));
  if (onMatch) {
    const matched = onMatch[1].toLowerCase();
    return CHAIN_ALIASES[matched] || matched.charAt(0).toUpperCase() + matched.slice(1);
  }

  return null;
}
