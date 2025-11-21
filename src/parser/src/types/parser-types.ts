import type {
    ParserRuleContext,
    Token,
    TokenStream
} from "antlr4";

type SemanticScopeTrackerConstructor =
    typeof import("@gml-modules/semantic").Semantic.ScopeTracker;

type SemanticScopeTracker = InstanceType<SemanticScopeTrackerConstructor>;

/**
 * Parser runtime contracts exposed to the rest of the workspace. Centralising
 * these types keeps the parser implementation and the unit tests aligned while
 * avoiding circular runtime dependencies.
 */
export type ParserContext = ParserRuleContext | null | undefined;

export interface ParserToken extends Token {
    symbol?: Token | null;
    start?: Token | null;
    stop?: Token | null;
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
