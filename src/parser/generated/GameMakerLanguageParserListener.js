import antlr4 from 'antlr4';

import { VISIT_METHOD_NAMES } from './GameMakerLanguageParserVisitor.js';

const NOOP = () => {};

const DEFAULT_LISTENER_DELEGATE = ({ fallback = NOOP }) => fallback();

export const LISTENER_METHOD_NAMES = Object.freeze(
    VISIT_METHOD_NAMES.flatMap((visitName) => {
        const suffix = visitName.slice('visit'.length);
        return [`enter${suffix}`, `exit${suffix}`];
    })
);

function createListenerDelegate(options = {}) {
    const { listenerDelegate, listenerHandlers } = options;

    const baseDelegate =
        typeof listenerDelegate === 'function'
            ? listenerDelegate
            : DEFAULT_LISTENER_DELEGATE;

    if (!listenerHandlers || typeof listenerHandlers !== 'object') {
        return baseDelegate;
    }

    const handlerEntries = Object.entries(listenerHandlers).filter(
        ([, value]) => typeof value === 'function'
    );

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

export default class GameMakerLanguageParserListener extends antlr4.tree.ParseTreeListener {
    #listenerDelegate;

    constructor(options = {}) {
        super();
        this.#listenerDelegate = createListenerDelegate(options);
    }

    _dispatch(methodName, ctx) {
        const phase = methodName.startsWith('enter') ? 'enter' : 'exit';
        return this.#listenerDelegate({
            methodName,
            phase,
            ctx,
            fallback: NOOP
        });
    }
}

for (const methodName of LISTENER_METHOD_NAMES) {
    Object.defineProperty(GameMakerLanguageParserListener.prototype, methodName, {
        value(ctx) {
            return this._dispatch(methodName, ctx);
        },
        writable: true,
        configurable: true
    });
}
