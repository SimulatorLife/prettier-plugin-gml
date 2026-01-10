import type { ParserRuleContext, Token, TokenStream } from "antlr4";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

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

/**
 * Global identifier tracking.
 *
 * Provides the ability to mark and apply global identifiers without
 * coupling to role management or scope lifecycle operations.
 */
export interface GlobalIdentifierTracker {
    markGlobalIdentifier(node: MutableGameMakerAstNode | null | undefined): void;
    applyGlobalIdentifiersToNode(node: MutableGameMakerAstNode | null | undefined): void;
    globalIdentifiers?: Set<unknown> | null;
}

/**
 * Identifier role management.
 *
 * Provides role tracking and manipulation operations for identifiers
 * without coupling to global tracking or scope lifecycle.
 */
export interface IdentifierRoleManager {
    /**
     * Execute a callback within an identifier role context.
     *
     * Pushes the provided role onto an internal stack, executes the callback,
     * and then pops the role. The role object typically contains:
     * - `type`: "declaration" or "reference"
     * - `kind`: Semantic kind (e.g., "variable", "function", "parameter")
     * - `tags`: Additional classification tags
     * - `scopeOverride`: Optional scope override for cross-scope declarations
     *
     * @param role Role descriptor object to apply during callback execution
     * @param callback Function to execute with the role active
     * @returns The result of the callback function
     */
    withRole?<T>(role: object | null, callback: () => T): T;

    /**
     * Create a deep copy of an identifier role object.
     *
     * @param role Role object to clone
     * @returns Cloned role with independent arrays and nested objects
     */
    cloneRole(role: object | null): object | null;

    /**
     * Apply the current active role to an identifier node.
     *
     * Annotates the node with metadata from the role stack, including
     * classification tags and scope information. This enables downstream
     * semantic analysis and code generation.
     *
     * @param name Identifier name being annotated
     * @param node AST node to receive role metadata
     */
    applyCurrentRoleToIdentifier(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined
    ): void;
}

/**
 * Scope lifecycle management.
 *
 * Provides the ability to manage scope boundaries during parsing
 * without coupling to identifier tracking or role management.
 */
export interface ScopeLifecycle {
    /**
     * Execute a callback within a new scope context.
     *
     * Creates a new scope with the specified kind, executes the callback,
     * and then exits the scope. Scopes form a stack during parsing, with
     * each scope tracking its own declarations and references.
     *
     * Common scope kinds include:
     * - "program" - Root scope for the entire file
     * - "function" - Function body scope
     * - "block" - Statement block scope
     * - "with" - GameMaker's `with` statement scope
     *
     * @param kind Semantic kind of scope being entered
     * @param callback Function to execute within the new scope
     * @returns The result of the callback function
     */
    withScope?<T>(kind: string, callback: () => T): T;
}

/**
 * Complete scope tracker interface.
 *
 * Combines all role-focused interfaces for consumers that need full
 * scope tracking capabilities. Consumers should prefer depending on
 * the minimal interface they need (GlobalIdentifierTracker,
 * IdentifierRoleManager, ScopeLifecycle) rather than this composite
 * interface when possible.
 */
export interface ScopeTracker extends GlobalIdentifierTracker, IdentifierRoleManager, ScopeLifecycle {}

export type ScopeTrackerOptions = {
    enabled: boolean;
    createScopeTracker?: () => ScopeTracker | null;
    getIdentifierMetadata?: boolean;
    [key: string]: unknown;
};

export interface ParserOptions {
    getComments: boolean; // We already have a 'transform' to omit comments, is this needed?
    getLocations: boolean;
    simplifyLocations: boolean;
    scopeTrackerOptions?: ScopeTrackerOptions; // Also handles identifier metadata

    // The `astFormat` field controls the structural representation of the parsed AST
    // and is used by Prettier's plugin dispatch logic to route documents to the
    // correct parser/printer pair. Currently recognized values:
    //   - "gml" → The canonical GML AST format consumed by this plugin's printer.
    //             This is the production format used for all formatting operations.
    //   - "json" (experimental/internal) → May trigger serialization of the AST
    //             to a plain JSON-compatible structure for debugging or external
    //             tooling integration, though this path is rarely exercised.
    //
    // The `asJSON` boolean below controls whether the parser should strip internal
    // properties (like parent references or non-enumerable metadata) to produce a
    // JSON-serializable output. In principle, `astFormat: "json"` and `asJSON: true`
    // are related but serve different layers: `astFormat` signals intent to Prettier's
    // routing, while `asJSON` alters the AST construction itself. In practice, these
    // fields are largely independent—`asJSON` can be set regardless of `astFormat`.
    //
    // GUIDANCE: Production code should always use `astFormat: "gml"` and leave
    // `asJSON: false` (the default). Setting `asJSON: true` is primarily useful for
    // diagnostic output or tooling that requires a JSON snapshot of the parse tree
    // without internal metadata clutter. Changing `astFormat` to anything other than
    // "gml" is unsupported and may cause the printer to fail or produce incorrect output.
    astFormat: string;
    asJSON: boolean;
}

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
