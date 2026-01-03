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

export interface ScopeTracker {
    markGlobalIdentifier(node: MutableGameMakerAstNode | null | undefined): void;
    applyGlobalIdentifiersToNode(node: MutableGameMakerAstNode | null | undefined): void;
    withRole?<T>(role: object | null, callback: () => T): T;
    withScope?<T>(kind: string, callback: () => T): T;
    cloneRole(role: object | null): object | null;
    applyCurrentRoleToIdentifier(
        name: string | null | undefined,
        node: MutableGameMakerAstNode | null | undefined
    ): void;
    globalIdentifiers?: Set<unknown> | null;
}

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
