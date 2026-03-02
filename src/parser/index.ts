import type { ParserConfig, ParseResult, StructuredIntent } from "../types";
import { IntentClassifier } from "./classifiers/intent-classifier";
import { AmountExtractor } from "./extractors/amount";
import { TokenExtractor } from "./extractors/token";
import { ActionExtractor } from "./extractors/action";
import { ConstraintExtractor } from "./extractors/constraints";
import { TemplateRegistry } from "./template/index";
import { normalizeText } from "./utils/normalize";
import {
    mergeEntities,
    calculateConfidence,
} from "./utils/parser-helpers";
import { validateIntent } from "./validators/schema";
import { TokenResolver } from "../services/token-resolver";

/**
 * Main Intent Parser Class
 *
 * Example usage:
 * ```typescript
 * const parser = new IntentParser();
 * const result = parser.parse("Swap 1000 USDC to ETH with max 1% slippage");
 * ```
 */
export class IntentParser {
    private classifier: IntentClassifier;
    private amountExtractor: AmountExtractor;
    private tokenExtractor: TokenExtractor;
    private actionExtractor: ActionExtractor;
    private constraintExtractor: ConstraintExtractor;
    private templates: TemplateRegistry;
    private config: Required<ParserConfig>;

    // TODO [Phase 3]: Token resolver instance for resolving symbol → address
    private tokenResolver: TokenResolver | null;

    constructor(config: ParserConfig = {}) {
        // Initialize with default config
        this.config = {
            defaultDeadlineOffset: 3600,
            knownTokens: {},
            knownProtocols: [],
            enableFuzzyMatching: false,
            enableCache: false,
            minConfidence: 0.5,
            tokenResolver: { enabled: false, cacheTTL: 300_000, timeout: 5000, maxCacheSize: 1000 },
            ...config,
        };

        // Initialize components
        this.classifier = new IntentClassifier();
        this.amountExtractor = new AmountExtractor();
        this.tokenExtractor = new TokenExtractor(this.config.knownTokens);
        this.actionExtractor = new ActionExtractor();
        this.constraintExtractor = new ConstraintExtractor();
        this.templates = new TemplateRegistry();

        // Initialize TokenResolver if config.tokenResolver is provided and enabled
        if (this.config.tokenResolver?.enabled) {
            this.tokenResolver = new TokenResolver(this.config.tokenResolver);
        } else {
            this.tokenResolver = null;
        }
    }

    /**
     * Parse natural language text into structured intent
     *
     * INPUT: Natural language string
     * OUTPUT: ParseResult with StructuredIntent or error
     *
     * TODO:
     * 1. Normalize input text
     * 2. Classify intent type
     * 3. Extract entities (amounts, tokens, actions, constraints)
     * 4. Map entities to appropriate template
     * 5. Validate result
     * 6. Return structured intent
     */
    parse(text: string): ParseResult {
        try {
            // Step 1: Normalize text
            const normalizedText = normalizeText(text);

            // Step 2: Classify intent type
            const intentType = this.classifier.classify(normalizedText);

            // Step 3: Extract entities
            const amounts = this.amountExtractor.extract(normalizedText);
            const tokens = this.tokenExtractor.extract(normalizedText);
            const actions = this.actionExtractor.extract(normalizedText);
            const constraints = this.constraintExtractor.extract(normalizedText);

            // Step 4: Get appropriate template
            const template = this.templates.get(intentType);
            if (!template) {
                return {
                    success: false,
                    error: `No template found for intent type: ${intentType}`,
                };
            }

            // Step 5: Build structured intent
            const structuredIntent = this.buildIntent(
                intentType,
                { amounts, tokens, actions, constraints },
                template,
                text,
            );

            // Step 6: Validate
            const validation = validateIntent(structuredIntent);
            if (!validation.success) {
                return {
                    success: false,
                    error: validation.error,
                };
            }

            return {
                success: true,
                data: structuredIntent,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    /**
     * Build structured intent from extracted entities and template
     *
     * INPUT:
     * - intentType: Classified intent type
     * - entities: All extracted entities
     * - template: Intent template
     * - originalText: Original user input
     *
     * OUTPUT: StructuredIntent
     *
     * TODO:
     * 1. Map entities to parameters based on template
     * 2. Fill in default values for missing fields
     * 3. Build constraints
     * 4. Calculate confidence score
     * 5. Add metadata
     */
    private buildIntent(
        intentType: string,
        entities: any,
        template: any,
        originalText: string,
    ): StructuredIntent {
        // 1. Merge entities into parameters
        const extractedParams = mergeEntities(entities, intentType, originalText);

        // 2. Apply template defaults
        const parameters = {
            ...template.defaults,
            ...extractedParams,
        };

        // 3. Build constraints
        const constraints: any = {
            ...template.defaultConstraints,
            // Template defaults set deadline=0 as placeholder — always compute actual deadline
            deadline: Date.now() + this.config.defaultDeadlineOffset * 1000,
        };

        // Add extracted constraints
        if (entities.constraints) {
            entities.constraints.forEach((c: any) => {
                if (c.type === "slippage") {
                    constraints.maxSlippage = c.value;
                }
                // TODO: Map other constraints
            });
        }

        // Note: Token address resolution is handled in parseAsync / resolveTokenAddresses
        // to keep buildIntent synchronous for backward compatibility.

        // 4. Calculate confidence score
        const confidence = calculateConfidence(parameters, template);

        // 5. Add metadata
        return {
            intentType: intentType as any,
            parameters,
            constraints,
            metadata: {
                originalText,
                confidence,
                parsedAt: Date.now(),
                warnings: [], // TODO: Add warnings based on validation/confidence
            },
        };
    }

    /**
     * Async parse — sama seperti parse() tapi dengan token address resolution
     *
     * INPUT: Natural language string
     * OUTPUT: Promise<ParseResult> (dengan inputTokenAddress/outputTokenAddress terisi)
     *
     * KAPAN PAKAI:
     *   - Gunakan parseAsync() jika tokenResolver.enabled = true
     *   - Gunakan parse() jika tidak butuh token address (tetap sync, backward compatible)
     *
     * BREAKING CHANGE MITIGATION:
     *   - parse() TETAP sync → tidak ada breaking change
     *   - parseAsync() BARU → consumer opt-in ke async behavior
     *
     * TODO [Phase 3]: Implement parseAsync
     *
     * FLOW:
     *   1. Jalankan semua langkah sama seperti parse()
     *   2. Setelah buildIntent, call resolveTokenAddresses()
     *   3. Recalculate confidence (bonus jika address ditemukan)
     *   4. Return ParseResult
     *
     * CONTOH:
     *   const result = await parser.parseAsync("swap 10 USDC to ETH");
     *   result.data?.parameters.inputTokenAddress // "0xA0b8..."
     */
    async parseAsync(text: string): Promise<ParseResult> {
        // Step 1: Jalankan parse() biasa (sync) untuk dapatkan base intent
        const result = this.parse(text);
        if (!result.success || !result.data) return result;

        // Step 2: Jika tokenResolver aktif → resolve addresses
        if (this.tokenResolver) {
            await this.resolveTokenAddresses(result.data);

            // Step 3: Recalculate confidence — addresses may now be resolved,
            // which triggers address bonuses in calculateConfidence
            const template = this.templates.get(result.data.intentType);
            if (template) {
                result.data.metadata.confidence = calculateConfidence(
                    result.data.parameters,
                    template,
                );
            }
        }

        // Step 4: Return enriched result
        return result;
    }

    /**
     * Resolve token addresses in a StructuredIntent
     *
     * INPUT: StructuredIntent (akan di-mutate — address fields diisi)
     * OUTPUT: void (mutates intent.parameters in-place)
     *
     * LOGIC:
     *   1. Determine chain dari intent.parameters.sourceChain atau "ethereum"
     *   2. Resolve inputToken jika ada
     *   3. Resolve outputToken jika ada (gunakan targetChain untuk bridge)
     *   4. Tambahkan warning ke metadata jika resolve gagal
     *
     * CONTOH:
     *   intent.parameters = { inputToken: "USDC", sourceChain: "Polygon" }
     *   → setelah resolve: { inputToken: "USDC", inputTokenAddress: "0x3c49...", sourceChain: "Polygon" }
     *
     * TODO [Phase 3]: Implement resolveTokenAddresses
     */
    private async resolveTokenAddresses(
        intent: StructuredIntent,
    ): Promise<void> {
        if (!this.tokenResolver) return;

        // Default chain to ethereum if not specified
        // Normalization should handle casing, but we ensure lowercase here for cache/API consistency
        const chain = (intent.parameters.sourceChain || "ethereum").toLowerCase();
        const warnings: string[] = intent.metadata.warnings || [];

        // Resolve inputToken
        if (intent.parameters.inputToken) {
            const resolved = await this.tokenResolver.resolve(
                intent.parameters.inputToken,
                chain,
            );
            if (resolved) {
                intent.parameters.inputTokenAddress = resolved.address;
            } else {
                warnings.push(`Could not resolve address for ${intent.parameters.inputToken} on ${chain}`);
            }
        }

        // Resolve outputToken
        // If it's a bridge, targetChain might be different. 
        // If not bridge, it's usually on the same chain (swap)
        if (intent.parameters.outputToken) {
            const outputChain = (intent.parameters.targetChain || chain).toLowerCase();
            const resolved = await this.tokenResolver.resolve(
                intent.parameters.outputToken,
                outputChain,
            );
            if (resolved) {
                intent.parameters.outputTokenAddress = resolved.address;
            } else {
                warnings.push(`Could not resolve address for ${intent.parameters.outputToken} on ${outputChain}`);
            }
        }

        intent.metadata.warnings = warnings;
    }

    /**
     * Batch parse multiple intents (sync — tanpa token resolution)
     *
     * INPUT: Array of natural language strings
     * OUTPUT: Array of ParseResult
     */
    parseBatch(texts: string[]): ParseResult[] {
        return texts.map((text) => this.parse(text));
    }

    /**
     * Batch parse multiple intents (async — dengan token resolution)
     *
     * INPUT: Array of natural language strings
     * OUTPUT: Promise<ParseResult[]>
     *
     * TODO [Phase 3]: Implement async batch parsing
     *
     * LOGIC:
     *   - Gunakan Promise.all() untuk parallel parsing
     *   - Setiap text di-parse via parseAsync()
     *   - Return array of results
     */
    async parseBatchAsync(texts: string[]): Promise<ParseResult[]> {
        return Promise.all(texts.map((text) => this.parseAsync(text)));
    }
}

// Export everything
export * from "../types";
export { IntentParser as default };
