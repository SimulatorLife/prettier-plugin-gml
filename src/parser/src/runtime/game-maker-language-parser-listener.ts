import { Core } from "@gml-modules/core";
import type {
    ListenerDelegate,
    ListenerOptions,
    ParserContext
} from "../types/index.js";
import { VISIT_METHOD_NAMES } from "./game-maker-language-parser-visitor.js";
import {
    definePrototypeMethods,
    deriveListenerMethodNames,
    toDelegate
} from "./parse-tree-helpers.js";
import {
    getParserListenerBase,
    type ParserListenerBaseConstructor
} from "./generated-bindings.js";

const DEFAULT_LISTENER_DELEGATE: ListenerDelegate = ({
    fallback = Core.noop
}) => fallback();

export const LISTENER_METHOD_NAMES = Object.freeze(
    deriveListenerMethodNames(VISIT_METHOD_NAMES)
);

const GeneratedParserListenerBase: ParserListenerBaseConstructor =
    getParserListenerBase();

function createListenerDelegate(
    options: ListenerOptions = {}
): ListenerDelegate {
    const { listenerDelegate, listenerHandlers } = options;
    const baseDelegate = toDelegate(
        listenerDelegate,
        DEFAULT_LISTENER_DELEGATE
    );

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

export default class GameMakerLanguageParserListener extends GeneratedParserListenerBase {
    #listenerDelegate: ListenerDelegate;

    constructor(options: ListenerOptions = {}) {
        super();
        this.#listenerDelegate = createListenerDelegate(options);
    }

    _dispatch(methodName: string, ctx: ParserContext) {
        const phase = methodName.startsWith("enter") ? "enter" : "exit";
        return this.#listenerDelegate({
            methodName,
            phase,
            ctx,
            fallback: Core.noop
        });
    }
}

definePrototypeMethods(
    GameMakerLanguageParserListener.prototype,
    LISTENER_METHOD_NAMES,
    (methodName: string) =>
        function (this: GameMakerLanguageParserListener, ctx: ParserContext) {
            return this._dispatch(methodName, ctx);
        }
);
