import type { ParserRuleContext, Token, TokenStream } from "antlr4";
import type { Semantic } from "@gml-modules/semantic";

type SemanticScopeTracker = InstanceType<typeof Semantic.SemanticScopeCoordinator>;

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

export type ScopeTrackerOptions = {
    // TODO: Combine directly into ParserOptions?
    enabled: boolean;
    createScopeTracker?: () => SemanticScopeTracker;
    getIdentifierMetadata?: boolean; // TODO: Is this needed? Don't we always want the metadata?
    [key: string]: unknown; // TODO: Add proper typing here. What is this for?
};

export interface ParserOptions {
    getComments: boolean; // We already have a 'transform' to omit comments, is this needed?
    getLocations: boolean;
    simplifyLocations: boolean;
    scopeTrackerOptions?: ScopeTrackerOptions; // Also handles identifier metadata
    astFormat: string; // TODO: What are the possible values here?
    asJSON: boolean;

    // TODO: Combine 'transforms' into 'transformOptions' and give 'transformOptions' a proper type
    transforms?: Array<unknown>; // TODO: What are the possible values here?
    transformOptions?: Record<string, unknown>;
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
