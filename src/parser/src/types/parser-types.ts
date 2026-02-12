import type { ScopeTrackerOptions } from "@gml-modules/core";
import type { ParserRuleContext, Token, TokenStream } from "antlr4";

export type ParserContext =
    | (ParserRuleContext & {
          [methodName: string]: (...args: Array<unknown>) => unknown;
      })
    | null
    | undefined;

export type ParserContextMethod = (
    this: ParserRuleContext,
    ...args: Array<unknown>
) => ParserContext | ParserContext[] | null | undefined;

export type ParserContextWithMethods = ParserRuleContext & {
    [methodName: string]: (...args: Array<unknown>) => unknown;
};

export interface ParserToken extends Token {
    symbol?: Token | null;
}

// Re-export scope tracker types from Core for convenience
export type {
    GlobalIdentifierTracker,
    IdentifierRoleManager,
    ScopeLifecycle,
    ScopeTracker,
    ScopeTrackerOptions
} from "@gml-modules/core";

/**
 * Comment extraction options.
 *
 * Controls whether the parser should extract and attach comment nodes
 * to the AST. Consumers that only need structural parsing without
 * comments can disable this to reduce memory and processing overhead.
 */
export interface CommentProcessingOptions {
    /**
     * Whether to extract and attach comments to the AST.
     *
     * When true, the parser collects all comments and makes them
     * available via the `comments` property of the parse result.
     *
     * @default true
     */
    getComments: boolean;
}

/**
 * Location metadata options.
 *
 * Controls how the parser tracks and reports source location information
 * for AST nodes. Consumers can disable location tracking entirely or
 * choose between verbose and compact location formats.
 */
export interface LocationMetadataOptions {
    /**
     * Whether to include location metadata in AST nodes.
     *
     * When false, all location properties are stripped from nodes,
     * reducing memory usage for tools that don't need source positions.
     *
     * @default true
     */
    getLocations: boolean;

    /**
     * Whether to use simplified location format.
     *
     * When true and getLocations is true, locations use a compact
     * format with start/end offsets. When false, locations include
     * full line/column information.
     *
     * Only applies when getLocations is true.
     *
     * @default true
     */
    simplifyLocations: boolean;
}

/**
 * Scope tracking configuration.
 *
 * Controls whether the parser should perform semantic scope analysis
 * during parsing to track variable declarations, references, and
 * identifier roles. Used primarily for advanced semantic analysis.
 */
export interface ScopeTrackingOptions {
    /**
     * Scope tracker configuration.
     *
     * When provided, enables scope tracking with the specified options.
     * When undefined or with enabled:false, scope tracking is disabled.
     *
     * @default { enabled: false, getIdentifierMetadata: false }
     */
    scopeTrackerOptions?: ScopeTrackerOptions;
}

/**
 * Output format options.
 *
 * Controls the structural representation and serialization format
 * of the parsed AST. Used primarily by Prettier's plugin dispatch
 * and for debugging/tooling integration.
 */
export interface OutputFormatOptions {
    /**
     * The target AST format for the parse output.
     *
     * - "gml" (default): The canonical GML AST format consumed by
     *   the plugin's printer. This is the production format.
     * - "json" (experimental): May trigger serialization to a
     *   JSON-compatible structure for debugging or external tools.
     *
     * Changing from "gml" may cause the printer to fail.
     *
     * @default "gml"
     */
    astFormat: string;

    /**
     * Whether to strip internal properties for JSON serialization.
     *
     * When true, removes parent references and non-enumerable metadata
     * to produce a JSON-serializable output. Primarily useful for
     * diagnostic output or tooling integration.
     *
     * Independent of astFormat and can be set regardless of it.
     *
     * @default false
     */
    asJSON: boolean;
}

/**
 * Complete parser options interface.
 *
 * Combines all role-focused option interfaces for consumers that need
 * full parser configuration capabilities. Consumers should prefer depending
 * on the minimal interface they need (CommentProcessingOptions,
 * LocationMetadataOptions, etc.) rather than this composite interface
 * when possible.
 */
export interface ParserOptions
    extends CommentProcessingOptions,
        LocationMetadataOptions,
        ScopeTrackingOptions,
        OutputFormatOptions {}

const DEFAULT_SCOPE_TRACKER_OPTIONS: ScopeTrackerOptions = Object.freeze({
    enabled: false,
    getIdentifierMetadata: false
});

export const defaultParserOptions: ParserOptions = Object.freeze({
    getComments: true,
    getLocations: true,
    simplifyLocations: true,
    scopeTrackerOptions: DEFAULT_SCOPE_TRACKER_OPTIONS,
    astFormat: "gml",
    asJSON: false
});

export type ListenerPhase = "enter" | "exit";

export type ListenerPayload = {
    methodName: string;
    phase: ListenerPhase;
    ctx: ParserRuleContext;
    fallback: () => unknown;
};

export type ListenerDelegate = (payload: ListenerPayload) => unknown;

export type ListenerHandler = (ctx: ParserRuleContext, payload: ListenerPayload) => unknown;

export interface ListenerOptions {
    listenerDelegate?: ListenerDelegate;
    listenerHandlers?: Record<string, ListenerHandler>;
}

export type VisitorPayload = {
    methodName: string;
    ctx: ParserRuleContext;
    fallback: () => unknown;
};

export interface VisitorOptions {
    visitChildrenDelegate?: (payload: VisitorPayload) => unknown;
}

export interface TokenMetadataOptions {
    fallbackCandidates?: Array<Token | number | null | undefined>;
    stream?: TokenStream | null;
}
