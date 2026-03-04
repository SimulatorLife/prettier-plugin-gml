import { Core } from "@gml-modules/core";

import type { ListenerDelegate, ListenerOptions, ParserContext } from "../types/index.js";
import { toDelegate } from "./delegation.js";

const DEFAULT_LISTENER_DELEGATE: ListenerDelegate = ({ fallback = Core.noop }) => fallback();

interface ListenerPhaseResolver {
    resolve(methodName: string): "enter" | "exit";
}

interface ListenerMethodDispatcher {
    dispatch(methodName: string, ctx: ParserContext): unknown;
}

class PrefixListenerPhaseResolver implements ListenerPhaseResolver {
    resolve(methodName: string): "enter" | "exit" {
        return methodName.startsWith("enter") ? "enter" : "exit";
    }
}

class DelegateBackedListenerMethodDispatcher implements ListenerMethodDispatcher {
    readonly #listenerDelegate: ListenerDelegate;
    readonly #phaseResolver: ListenerPhaseResolver;

    constructor(listenerDelegate: ListenerDelegate, phaseResolver: ListenerPhaseResolver) {
        this.#listenerDelegate = listenerDelegate;
        this.#phaseResolver = phaseResolver;
    }

    dispatch(methodName: string, ctx: ParserContext): unknown {
        const phase = this.#phaseResolver.resolve(methodName);

        return this.#listenerDelegate({
            methodName,
            phase,
            ctx,
            fallback: Core.noop
        });
    }
}

function createListenerDelegate(options: ListenerOptions): ListenerDelegate {
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

/**
 * Creates a listener method dispatcher that translates generated parser listener callbacks
 * into delegate payloads with consistent phase metadata and fallback behavior.
 */
export function createListenerMethodDispatcher(options: ListenerOptions = {}): ListenerMethodDispatcher {
    return new DelegateBackedListenerMethodDispatcher(
        createListenerDelegate(options),
        new PrefixListenerPhaseResolver()
    );
}
