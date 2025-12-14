import test from "node:test";
import assert from "node:assert/strict";

import { BasicSemanticOracle } from "../src/symbols/sem-oracle.js";
import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("BasicSemanticOracle: integrates with transpiler interface", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare(
        "myGlobal",
        {
            start: { line: 1, index: 0 },
            end: { line: 1, index: 8 }
        },
        { tags: ["global"] }
    );

    tracker.enterScope("function");

    tracker.declare("localVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    const builtins = new Set([
        "show_debug_message",
        "array_length",
        "string_upper"
    ]);
    const oracle = new BasicSemanticOracle(tracker, builtins);

    const globalResult = oracle.kindOfIdent({ name: "myGlobal" });
    assert.strictEqual(globalResult, "global_field");

    const localResult = oracle.kindOfIdent({ name: "localVar" });
    assert.strictEqual(localResult, "local");

    const builtinResult = oracle.kindOfIdent({ name: "array_length" });
    assert.strictEqual(builtinResult, "builtin");

    const nameResult = oracle.nameOfIdent({ name: "localVar" });
    assert.strictEqual(nameResult, "localVar");

    const callResult = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "show_debug_message" }
    });
    assert.strictEqual(callResult, "builtin");
});

void test("BasicSemanticOracle: handles complex scope nesting", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "globalCounter",
        {
            start: { line: 1, index: 0 },
            end: { line: 1, index: 13 }
        },
        { tags: ["global"] }
    );

    tracker.enterScope("function");
    tracker.declare("outerVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    tracker.enterScope("block");
    tracker.declare("innerVar", {
        start: { line: 5, index: 0 },
        end: { line: 5, index: 8 }
    });

    const oracle = new BasicSemanticOracle(tracker);

    const global = oracle.kindOfIdent({ name: "globalCounter" });
    assert.strictEqual(global, "global_field");

    const outer = oracle.kindOfIdent({ name: "outerVar" });
    assert.strictEqual(outer, "local");

    const inner = oracle.kindOfIdent({ name: "innerVar" });
    assert.strictEqual(inner, "local");
});

void test("BasicSemanticOracle: respects lexical scoping with shadowing", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "value",
        {
            start: { line: 1, index: 0 },
            end: { line: 1, index: 5 }
        },
        { tags: ["global"] }
    );

    tracker.enterScope("function");
    tracker.declare("value", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 5 }
    });

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "value" });
    assert.strictEqual(
        result,
        "local",
        "Should resolve to shadowing local, not outer global"
    );
});

void test("BasicSemanticOracle: supports multiple builtin sets", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const gmlBuiltins = new Set([
        "show_debug_message",
        "draw_text",
        "array_length",
        "ds_list_create"
    ]);

    const oracle = new BasicSemanticOracle(tracker, gmlBuiltins);

    assert.strictEqual(
        oracle.kindOfIdent({ name: "show_debug_message" }),
        "builtin"
    );
    assert.strictEqual(oracle.kindOfIdent({ name: "draw_text" }), "builtin");
    assert.strictEqual(oracle.kindOfIdent({ name: "array_length" }), "builtin");
    assert.strictEqual(
        oracle.kindOfIdent({ name: "ds_list_create" }),
        "builtin"
    );

    assert.strictEqual(oracle.kindOfIdent({ name: "my_custom_func" }), "local");
});

void test("BasicSemanticOracle: handles empty tracker gracefully", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "undeclaredVar" });
    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: call target analysis with multiple builtins", () => {
    const builtins = new Set([
        "show_debug_message",
        "instance_create_depth",
        "audio_play_sound"
    ]);
    const oracle = new BasicSemanticOracle(null, builtins);

    const debugCall = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "show_debug_message" }
    });
    assert.strictEqual(debugCall, "builtin");

    const createCall = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "instance_create_depth" }
    });
    assert.strictEqual(createCall, "builtin");

    const customCall = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "my_script" }
    });
    assert.strictEqual(customCall, "unknown");
});
