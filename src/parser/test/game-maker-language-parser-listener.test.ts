import assert from "node:assert/strict";
import { test } from "node:test";

import GameMakerLanguageParserListener, {
    LISTENER_METHOD_NAMES
} from "../src/runtime/game-maker-language-parser-listener.js";
import { getParserListenerBase, getParseTreeListenerPrototype } from "../src/runtime/generated-bindings.js";

void test("listener methods default to no-op behaviour", () => {
    const listener = new GameMakerLanguageParserListener();

    for (const methodName of LISTENER_METHOD_NAMES) {
        assert.equal(typeof listener[methodName], "function");
        assert.equal(listener[methodName]({}), undefined);
    }
});

void test("listener delegate receives metadata for each call", () => {
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

void test("method-specific handlers can wrap the delegate", () => {
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

void test("unhandled methods still route to the delegate", () => {
    let delegateCalls = 0;
    let handlerCalls = 0;

    const listener = new GameMakerLanguageParserListener({
        listenerDelegate: () => {
            delegateCalls += 1;
        },
        listenerHandlers: {
            exitBlock: () => {
                handlerCalls += 1;
            }
        }
    });

    listener.enterProgram({});

    assert.equal(handlerCalls, 0);
    assert.equal(delegateCalls, 1);
});

void test("instanceof check passes for the generated listener base class via symbol patching", () => {
    const GeneratedListenerBase = getParserListenerBase();
    const listener = new GameMakerLanguageParserListener();

    // The compositional listener (which no longer inherits) must still pass
    // instanceof checks against the generated base so ANTLR internals accept it.
    assert.equal(listener instanceof (GeneratedListenerBase as unknown as { new (): unknown }), true);
});

void test("inherited ParseTreeListener methods are present and callable", () => {
    // The ANTLR walker calls enterEveryRule, exitEveryRule, visitTerminal, and
    // visitErrorNode on any registered listener. These are inherited from
    // ParseTreeListener in a traditional subclass but must be explicitly delegated
    // by the compositional wrapper.
    const listenerProto = getParseTreeListenerPrototype();
    const inheritedNames = Object.getOwnPropertyNames(listenerProto).filter((n) => n !== "constructor");
    const listener = new GameMakerLanguageParserListener();

    for (const methodName of inheritedNames) {
        assert.equal(
            typeof listener[methodName],
            "function",
            `Expected inherited method "${methodName}" to be a function on the compositional listener`
        );
    }
});
