import assert from "node:assert/strict";
import { test } from "node:test";

import GameMakerLanguageParserListener, {
    LISTENER_METHOD_NAMES
} from "../generated/GameMakerLanguageParserListener.js";

test("listener methods default to no-op behaviour", () => {
    const listener = new GameMakerLanguageParserListener();

    for (const methodName of LISTENER_METHOD_NAMES) {
        assert.equal(typeof listener[methodName], "function");
        assert.equal(listener[methodName]({}), undefined);
    }
});

test("listener delegate receives metadata for each call", () => {
    let callCount = 0;
    let lastPayload = null;

    const listener = new GameMakerLanguageParserListener({
        listenerDelegate: (payload) => {
            callCount += 1;
            lastPayload = payload;
        }
    });

    const context = { key: "value" };
    listener.enterProgram(context);

    assert.equal(callCount, 1);
    assert.equal(lastPayload.methodName, "enterProgram");
    assert.equal(lastPayload.phase, "enter");
    assert.equal(lastPayload.ctx, context);
    assert.equal(typeof lastPayload.fallback, "function");
});

test("method-specific handlers can wrap the delegate", () => {
    let handlerCalls = 0;
    let delegateCalls = 0;

    const listener = new GameMakerLanguageParserListener({
        listenerDelegate: () => {
            delegateCalls += 1;
        },
        listenerHandlers: {
            exitBlock: (ctx, payload) => {
                handlerCalls += 1;
                assert.equal(payload.methodName, "exitBlock");
                assert.equal(payload.phase, "exit");
                assert.equal(payload.ctx, ctx);
                payload.fallback();
            }
        }
    });

    listener.exitBlock({});

    assert.equal(handlerCalls, 1);
    assert.equal(delegateCalls, 1);
});
