import type { ParserContext } from "../types/index.js";
import GameMakerLanguageParserListenerBase from "../../generated/GameMakerLanguageParserListener.js";
import GameMakerLanguageParserVisitorBase from "../../generated/GameMakerLanguageParserVisitor.js";

export type ParseTreeListenerMethod = (...args: unknown[]) => unknown;

export type ParseTreeVisitorMethod = (...args: unknown[]) => unknown;

export interface ParserListenerBase {
    _dispatch?(methodName: string, ctx: ParserContext): unknown;
    [methodName: string]: ParseTreeListenerMethod;
}

export interface ParserListenerBaseConstructor {
    new (): ParserListenerBase;
    readonly prototype: ParserListenerBase;
}

export interface ParserVisitorPrototype {
    visitChildren: ParseTreeVisitorMethod;
    [methodName: string]: ParseTreeVisitorMethod;
    [methodSymbol: symbol]: unknown;
}

export interface ParserVisitorBaseConstructor {
    new (): ParserVisitorPrototype;
    readonly prototype: ParserVisitorPrototype;
}

/**
 * Provides a stable handle to the generated parser listener base class so
 * runtime code can depend on an injected constructor rather than reaching into
 * the generated output directly.
 */
export function getParserListenerBase(): ParserListenerBaseConstructor {
    return GameMakerLanguageParserListenerBase as unknown as ParserListenerBaseConstructor;
}

/**
 * Provides a stable handle to the generated parser visitor base class so
 * runtime code can depend on an injected constructor rather than reaching into
 * the generated output directly.
 */
export function getParserVisitorBase(): ParserVisitorBaseConstructor {
    return GameMakerLanguageParserVisitorBase as unknown as ParserVisitorBaseConstructor;
}

/**
 * Exposes the shared parse tree visitor prototype used by the generated base
 * class so wrappers can delegate inherited behaviour without relying on the
 * generated module layout.
 */
export function getParseTreeVisitorPrototype(): ParserVisitorPrototype {
    return Object.getPrototypeOf(getParserVisitorBase().prototype) as ParserVisitorPrototype;
}
