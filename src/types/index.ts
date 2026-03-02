import { StructuredIntent } from "./intent";
import type { TokenResolverConfig } from "./token";
// Re-export all types
export * from "./common";
export * from "./chain";
export * from "./intent";
export * from "./entities";
export * from "./templates";
export * from "./token";

/**
 * Parser Configuration
 */
export interface ParserConfig {
  // Default deadline offset in seconds (default: 3600 = 1 hour)
  defaultDeadlineOffset?: number;

  // Known token addresses (symbol -> address mapping)
  knownTokens?: Record<string, string>;

  // Known protocol names
  knownProtocols?: string[];

  // Enable/disable features
  enableFuzzyMatching?: boolean;
  enableCache?: boolean;

  // Confidence threshold (0-1)
  minConfidence?: number;

  /**
   * Token Resolver Configuration (Swing.xyz API)
   *
   * Jika disediakan dan enabled=true, gunakan parseAsync() untuk mendapatkan
   * token address resolution. parse() tetap sync dan backward-compatible.
   *
   * CONTOH:
   *   tokenResolver: {
   *     enabled: true,
   *     cacheTTL: 300_000,
   *     timeout: 5000,
   *   }
   */
  tokenResolver?: TokenResolverConfig;
}

/**
 * Parse Result
 * Wrapper around StructuredIntent with success/error handling
 */

export interface ParseResult {
  success: boolean;
  data?: StructuredIntent;
  error?: string;
  warnings?: string[];
}
