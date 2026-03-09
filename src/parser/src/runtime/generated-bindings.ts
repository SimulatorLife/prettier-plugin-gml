/**
 * Stable abstraction layer for generated ANTLR parser classes.
 *
 * This module provides a clean facade over the generated ANTLR parser code,
 * allowing runtime code to depend on stable constructors and prototypes rather
 * than importing directly from the generated output.
 *
 * Architectural boundaries:
 * - Parser/generated owns: ANTLR-generated lexer, parser, listener, and visitor
 * - Parser/runtime owns: Custom parse tree traversal, AST building, and runtime logic
 * - This facade: Provides stable handles to generated classes without exposing internals
 *
 * The deep relative imports (../../generated/) are acceptable here because:
 * 1. They're internal to the parser workspace
 * 2. The generated code location is fixed and predictable
 * 3. This file IS the abstraction layer that shields other code from these details
 *
 * All other parser code should import from this facade, not from generated/ directly.
 *
 * Design note: the generated classes are exported as frozen constants rather
 * than getter functions because there is no injection mechanism – they always
 * resolve to the same value. Exporting constants removes the false implication
 * of "swappable constructors" and eliminates the extra call-site indirection.
 */

import GeneratedListenerBase from "../../generated/GameMakerLanguageParserListener.js";
import GeneratedVisitorBase from "../../generated/GameMakerLanguageParserVisitor.js";
import type { ParserContext } from "../types/index.js";

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
 * Typed handle to the generated parser listener base class. Runtime code
 * extends this class rather than importing from the generated directory
 * directly, keeping coupling isolated to this abstraction layer.
 */
export const PARSER_LISTENER_BASE: ParserListenerBaseConstructor =
    GeneratedListenerBase as unknown as ParserListenerBaseConstructor;

/**
 * Typed handle to the generated parser visitor base class. Runtime code
 * extends or wraps this class rather than importing from the generated
 * directory directly.
 */
export const PARSER_VISITOR_BASE: ParserVisitorBaseConstructor =
    GeneratedVisitorBase as unknown as ParserVisitorBaseConstructor;

/**
 * Shared parse tree visitor prototype inherited by the generated base class.
 * Wrappers delegate inherited behaviour through this prototype reference so
 * they avoid inheriting from the generated class directly.
 */
export const PARSE_TREE_VISITOR_PROTOTYPE: ParserVisitorPrototype = Object.getPrototypeOf(
    PARSER_VISITOR_BASE.prototype
) as ParserVisitorPrototype;
