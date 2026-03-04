import assert from "node:assert/strict";
import { test } from "node:test";

import { createListenerMethodDispatcher } from "../src/runtime/listener-method-dispatcher.js";

void test("dispatcher uses default no-op fallback", () => {
    const dispatcher = createListenerMethodDispatcher();

    assert.equal(dispatcher.dispatch("enterProgram", null), undefined);
});

void test("dispatcher resolves enter and exit phases", () => {
    const calls: string[] = [];
    const dispatcher = createListenerMethodDispatcher({
        listenerDelegate: (payload) => {
            calls.push(`${payload.methodName}:${payload.phase}`);
        }
    });

    dispatcher.dispatch("enterProgram", null);
    dispatcher.dispatch("exitProgram", null);

    assert.deepEqual(calls, ["enterProgram:enter", "exitProgram:exit"]);
});

void test("dispatcher routes methods with handlers through handler and fallback", () => {
    let delegateCalls = 0;
    const dispatcher = createListenerMethodDispatcher({
        listenerDelegate: () => {
            delegateCalls += 1;
        },
        listenerHandlers: {
            exitProgram: (_ctx, payload) => {
                assert.equal(payload.phase, "exit");
                payload.fallback();
            }
        }
    });

    dispatcher.dispatch("exitProgram", null);

    assert.equal(delegateCalls, 1);
});
