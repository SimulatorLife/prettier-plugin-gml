import type { ParserRuleContext, Token, TokenStream } from "antlr4";
import type { Semantic } from "@gml-modules/semantic";

type SemanticScopeTracker = InstanceType<typeof Semantic.ScopeTracker>;

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

export type ScopeTrackerOptions = { // TODO: Combine directly into ParserOptions?
    enabled: boolean;
    createScopeTracker?: () => SemanticScopeTracker;
    getIdentifierMetadata?: boolean; // TODO: Is this needed? Don't we always want the metadata?
    [key: string]: unknown; // TODO: Add proper typing here. What is this for?
};

export interface ParserOptions {
    getComments: boolean;
    getLocations: boolean;
    // Request that the parser attach identifier metadata when building
    // the AST. This metadata enables downstream analysis like scope
    // tracking and identifier indexing.
    getIdentifierMetadata?: boolean;
    simplifyLocations: boolean;
    scopeTrackerOptions?: ScopeTrackerOptions;
    astFormat: string;
    asJSON: boolean;
    transforms?: Array<unknown>;
    transformOptions?: Record<string, unknown>;
}

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
