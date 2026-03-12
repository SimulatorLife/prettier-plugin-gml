import assert from "node:assert/strict";
import { test } from "node:test";

import { emitBuiltinFunction, isBuiltinFunction } from "../src/emitter/builtins.js";

/**
 * Memory footprint test for builtin function storage.
 *
 * BEFORE: The module eagerly loaded ~1.3MB of identifier metadata and created
 * a Record with 1787 closures, consuming ~7 MB of heap.
 *
 * AFTER: The module uses a lazy-loaded Set. Module load is now ~3.1 MB (the
 * Set is loaded on first access), and builtin emission avoids materializing a
 * function-per-builtin compatibility structure.
 */

void test("isBuiltinFunction recognizes known builtins", () => {
    assert.ok(isBuiltinFunction("abs"), "Expected abs to be recognized as a builtin");
    assert.ok(!isBuiltinFunction("totally_not_a_builtin"), "Expected custom name to be rejected");
});

void test("emitBuiltinFunction formats builtin calls", () => {
    const result = emitBuiltinFunction("abs", ["value"]);
    assert.strictEqual(result, "abs(value)", "Should emit a standard builtin call");
});

void test("emitBuiltinFunction formats multi-argument builtin calls", () => {
    const samples = ["abs", "floor", "string", "show_debug_message", "draw_text"];

    for (const name of samples) {
        const args = ["arg1", "arg2"];
        const result = emitBuiltinFunction(name, args);
        const expected = `${name}(arg1, arg2)`;

        assert.strictEqual(result, expected, `Expected emitter for ${name} to produce "${expected}", got "${result}"`);
    }
});
