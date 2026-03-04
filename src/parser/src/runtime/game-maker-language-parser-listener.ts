import type { ListenerOptions, ParserContext } from "../types/index.js";
import { VISIT_METHOD_NAMES } from "./game-maker-language-parser-visitor.js";
import { getParserListenerBase, type ParserListenerBaseConstructor } from "./generated-bindings.js";
import { createListenerMethodDispatcher } from "./listener-method-dispatcher.js";
import { deriveListenerMethodNames } from "./method-reflection.js";
import { definePrototypeMethods } from "./prototype-builder.js";

export const LISTENER_METHOD_NAMES = Object.freeze(deriveListenerMethodNames(VISIT_METHOD_NAMES));

const GeneratedParserListenerBase: ParserListenerBaseConstructor = getParserListenerBase();

export default class GameMakerLanguageParserListener extends GeneratedParserListenerBase {
    readonly #methodDispatcher: ReturnType<typeof createListenerMethodDispatcher>;

    constructor(options: ListenerOptions = {}) {
        super();
        this.#methodDispatcher = createListenerMethodDispatcher(options);
    }

    dispatchListenerMethod(methodName: string, ctx: ParserContext): unknown {
        return this.#methodDispatcher.dispatch(methodName, ctx);
    }
}

definePrototypeMethods(
    GameMakerLanguageParserListener.prototype,
    LISTENER_METHOD_NAMES,
    (methodName: string) =>
        function (this: GameMakerLanguageParserListener, ctx: ParserContext) {
            return this.dispatchListenerMethod(methodName, ctx);
        }
);
