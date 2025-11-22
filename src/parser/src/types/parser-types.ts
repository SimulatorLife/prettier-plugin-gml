import type { ParserRuleContext, Token, TokenStream } from "antlr4";

type SemanticScopeTrackerConstructor =
    typeof import("@gml-modules/semantic").Semantic.ScopeTracker;

type SemanticScopeTracker = InstanceType<SemanticScopeTrackerConstructor>;

export type ParserContext = ParserRuleContext | null | undefined;

export type ParserContextMethod = (
    this: ParserRuleContext,
    ...args: Array<unknown>
) => ParserContext | ParserContext[] | null | undefined;

export type ParserContextWithMethods = ParserRuleContext & {
    [methodName: string]: ParserContextMethod;
};

export interface ParserToken extends Token {
    symbol?: Token | null;
}

export type ScopeTrackerContext = {
    enabled: boolean;
};

export type ScopeTrackerOptions = {
    createScopeTracker?: (
        context: ScopeTrackerContext
    ) => SemanticScopeTracker | null;
    getIdentifierMetadata?: boolean;
    [key: string]: unknown;
};

export interface ParserOptions {
    getComments: boolean;
    getLocations: boolean;
    simplifyLocations: boolean;
    getIdentifierMetadata: boolean;
    createScopeTracker:
        | ((context: ScopeTrackerContext) => SemanticScopeTracker | null)
        | null;
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
    fallbackCandidates?: Array<Token | null | undefined>;
    stream?: TokenStream | null;
}
