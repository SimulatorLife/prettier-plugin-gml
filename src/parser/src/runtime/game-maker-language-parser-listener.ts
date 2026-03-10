import { Core } from "@gml-modules/core";

import type { ListenerDelegate, ListenerOptions, ParserContext } from "../types/index.js";
import { toDelegate } from "./delegation.js";
import { VISIT_METHOD_NAMES } from "./game-maker-language-parser-visitor.js";
import {
    getParserListenerBase,
    getParseTreeListenerPrototype,
    type ParserListenerBase,
    type ParserListenerBaseConstructor,
    type ParseTreeListenerMethod
} from "./generated-bindings.js";
import { collectPrototypeMethodNames, deriveListenerMethodNames } from "./method-reflection.js";
import { definePrototypeMethods } from "./prototype-builder.js";
import { createWrapperSymbols, ensureHasInstancePatched } from "./symbol-patching.js";

const DEFAULT_LISTENER_DELEGATE: ListenerDelegate = ({ fallback = Core.noop }) => fallback();

export const LISTENER_METHOD_NAMES = Object.freeze(deriveListenerMethodNames(VISIT_METHOD_NAMES));

const GeneratedParserListenerBase: ParserListenerBaseConstructor = getParserListenerBase();
const PARSE_TREE_LISTENER_PROTOTYPE: ParserListenerBase = getParseTreeListenerPrototype();

const { instance: WRAPPER_INSTANCE_MARKER, patchFlag: HAS_INSTANCE_PATCHED_MARKER } = createWrapperSymbols(
    "GameMakerLanguageParserListener"
);

// Methods exposed by antlr4's ParseTreeListener that the compositional wrapper
// still needs to provide. We delegate to the original prototype so the ANTLR
// tree walker continues to observe the same behaviour (visitTerminal,
// visitErrorNode, enterEveryRule, exitEveryRule) without the class inheriting
// directly from the generated output.
// This mirrors the pattern used by GameMakerLanguageParserVisitor for its
// inherited visitor methods; keeping the two wrappers symmetric makes the
// intent clearer and the generated-code boundary easier to audit.
const INHERITED_LISTENER_METHOD_NAMES = Object.freeze(collectPrototypeMethodNames(PARSE_TREE_LISTENER_PROTOTYPE));

function createListenerDelegate(options: ListenerOptions = {}): ListenerDelegate {
    const { listenerDelegate, listenerHandlers } = options;
    const baseDelegate = toDelegate(listenerDelegate, DEFAULT_LISTENER_DELEGATE);

    if (!listenerHandlers || typeof listenerHandlers !== "object") {
        return baseDelegate;
    }

    const handlerEntries = Object.entries(listenerHandlers)
        .filter(([, value]) => typeof value === "function")
        .map(([key, value]) => [key, value] as const);

    if (handlerEntries.length === 0) {
        return baseDelegate;
    }

    const handlerMap = Object.fromEntries(handlerEntries);

    return (payload) => {
        const handler = handlerMap[payload.methodName];
        if (!handler) {
            return baseDelegate(payload);
        }

        const enhancedPayload = {
            ...payload,
            fallback: () => baseDelegate(payload)
        };

        return handler(enhancedPayload.ctx, enhancedPayload);
    };
}

ensureHasInstancePatched(GeneratedParserListenerBase, {
    markerSymbol: WRAPPER_INSTANCE_MARKER,
    patchFlagSymbol: HAS_INSTANCE_PATCHED_MARKER
});

export default class GameMakerLanguageParserListener implements ParserListenerBase {
    [methodName: string]: ParseTreeListenerMethod;
    [methodSymbol: symbol]: unknown;
    #listenerDelegate: ListenerDelegate;

    constructor(options: ListenerOptions = {}) {
        this.#listenerDelegate = createListenerDelegate(options);
        this[WRAPPER_INSTANCE_MARKER] = true;
    }

    _dispatch(methodName: string, ctx: ParserContext): unknown {
        const phase = methodName.startsWith("enter") ? "enter" : "exit";
        return this.#listenerDelegate({
            methodName,
            phase,
            ctx,
            fallback: Core.noop
        });
    }
}

// Delegate the inherited ParseTreeListener methods (visitTerminal, visitErrorNode,
// enterEveryRule, exitEveryRule) to the original prototype implementations so the
// ANTLR tree walker sees the same behaviour it would with a direct subclass.
definePrototypeMethods(
    GameMakerLanguageParserListener.prototype,
    INHERITED_LISTENER_METHOD_NAMES,
    (methodName: string) => {
        const inherited =
            typeof PARSE_TREE_LISTENER_PROTOTYPE[methodName] === "function"
                ? (PARSE_TREE_LISTENER_PROTOTYPE[methodName] as (
                      this: ParserListenerBase,
                      ...args: unknown[]
                  ) => unknown)
                : Core.noop;
        return function (this: GameMakerLanguageParserListener, ...args: unknown[]) {
            return inherited.call(this, ...args) as unknown;
        };
    }
);

// Inject all grammar-specific enter/exit listener methods, each routing to _dispatch.
definePrototypeMethods(
    GameMakerLanguageParserListener.prototype,
    LISTENER_METHOD_NAMES,
    (methodName: string) =>
        function (this: GameMakerLanguageParserListener, ctx: ParserContext) {
            return this._dispatch(methodName, ctx);
        }
);
