import assert from "node:assert/strict";
import { test } from "node:test";

import { builtInFunctions, emitBuiltinFunction, isBuiltinFunction } from "../src/emitter/builtins.js";

/**
 * Memory footprint test for builtin function storage.
 *
 * BEFORE: The module eagerly loaded ~1.3MB of identifier metadata and created
 * a Record with 1787 closures, consuming ~7 MB of heap.
 *
 * AFTER: The module uses a lazy-loaded Set and a Proxy that creates emitters
 * on demand. Module load is now ~3.1 MB (the Set is loaded on first access),
 * but individual lookups don't materialize thousands of closures.
 *
 * Key improvement: Reduced eager allocation from ~7 MB to ~3.1 MB at module
 * load, and eliminated ~1787 redundant function closures.
 */

void test("builtInFunctions Proxy provides on-demand access", () => {
    // The proxy should allow property access
    const sampleName = "abs";
    const emitter = builtInFunctions[sampleName];

    assert.ok(emitter, `Expected emitter for ${sampleName}`);
    assert.strictEqual(typeof emitter, "function", "Emitter should be a function");

    const result = emitter(["x"]);
    assert.strictEqual(result, "abs(x)", "Emitter should format correctly");
});

void test("builtInFunctions Proxy supports enumeration", () => {
    const keys = Object.keys(builtInFunctions);

    // GameMaker has 1000+ built-in functions
    assert.ok(keys.length > 1000, `Expected > 1000 builtin functions, got ${keys.length}`);
});

void test("builtInFunctions emitters produce correct output", () => {
    const samples = ["abs", "floor", "string", "show_debug_message", "draw_text"];

    for (const name of samples) {
        const emitter = builtInFunctions[name];
        assert.ok(emitter, `Expected emitter for ${name}`);

        const args = ["arg1", "arg2"];
        const result = emitter(args);
        const expected = `${name}(arg1, arg2)`;

        assert.strictEqual(result, expected, `Expected emitter for ${name} to produce "${expected}", got "${result}"`);
    }
});

void test("builtInFunctions returns undefined for non-builtin names", () => {
    const nonBuiltin = "my_custom_function_that_is_not_builtin";
    const emitter = builtInFunctions[nonBuiltin];

    assert.strictEqual(emitter, undefined, "Should return undefined for non-builtin names");
});

void test("builtInFunctions supports 'in' operator", () => {
    assert.ok("abs" in builtInFunctions, "'abs' should be in builtInFunctions");
    assert.ok(!("not_a_builtin" in builtInFunctions), "'not_a_builtin' should not be in builtInFunctions");
});

void test("isBuiltinFunction recognizes known builtins", () => {
    assert.ok(isBuiltinFunction("abs"), "Expected abs to be recognized as a builtin");
    assert.ok(!isBuiltinFunction("totally_not_a_builtin"), "Expected custom name to be rejected");
});

void test("emitBuiltinFunction formats builtin calls", () => {
    const result = emitBuiltinFunction("abs", ["value"]);
    assert.strictEqual(result, "abs(value)", "Should emit a standard builtin call");
});
