import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeWrapper } from "../index.js";

type CallScriptFn = (id: string, self: unknown, other: unknown, args: Array<unknown>) => unknown;

interface CallScriptGlobals {
    __call_script?: CallScriptFn;
    __hot?: Record<string, unknown>;
    __hot_call_script_original?: CallScriptFn;
}

void test("installScriptCallAdapter routes script calls through the wrapper", () => {
    const globals = globalThis as typeof globalThis & CallScriptGlobals;
    const savedCallScript = globals.__call_script;
    const savedHot = globals.__hot;
    const savedOriginal = globals.__hot_call_script_original;

    try {
        const fallbackCallScript: CallScriptFn = (id, self, other, args) => `fallback:${id}`;
        globals.__call_script = fallbackCallScript;

        const wrapper = RuntimeWrapper.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:double",
            js_body: "return args[0] * 2;"
        });

        RuntimeWrapper.installScriptCallAdapter(wrapper);

        const callScript = globals.__call_script;
        assert.strictEqual(callScript("script:double", null, null, [7]), 14);
        assert.strictEqual(callScript("script:missing", null, null, []), "fallback:script:missing");
    } finally {
        if (savedCallScript === undefined) {
            delete (globalThis as CallScriptGlobals).__call_script;
        } else {
            globals.__call_script = savedCallScript;
        }

        if (savedHot === undefined) {
            delete (globalThis as CallScriptGlobals).__hot;
        } else {
            globals.__hot = savedHot;
        }

        if (savedOriginal === undefined) {
            delete (globalThis as CallScriptGlobals).__hot_call_script_original;
        } else {
            globals.__hot_call_script_original = savedOriginal;
        }
    }
});
