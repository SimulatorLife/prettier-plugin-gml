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
    markGlobalIdentifier(
        node: MutableGameMakerAstNode | null | undefined
    ): void;
    applyGlobalIdentifiersToNode(
        node: MutableGameMakerAstNode | null | undefined
    ): void;
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

    // DOCUMENTATION NEEDED: The astFormat field controls how the parser formats its output,
    // but the valid values and their meanings are not documented. Known values include:
    //   - "gml" → standard GML AST format used by the plugin
    //   - "json" (possibly?) → serialized JSON representation
    //
    // The asJSON boolean below also suggests format variants. Clarify the relationship:
    // Does astFormat="json" imply asJSON=true, or are they independent?
    //
    // RECOMMENDATION: Document the valid values as a union type or enum:
    //   astFormat: "gml" | "json" | ...
    // and add comments explaining when each format is appropriate.
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

export type ListenerHandler = (
    ctx: ParserRuleContext,
    payload: ListenerPayload
) => unknown;

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
