import test from "node:test";
import assert from "node:assert/strict";

import { BasicSemanticOracle } from "../src/symbols/sem-oracle.js";
import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("BasicSemanticOracle: kindOfIdent returns 'local' for null node", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.kindOfIdent(null);

    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: kindOfIdent returns 'local' for node without name", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.kindOfIdent({ name: "" });

    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: kindOfIdent returns 'global_field' for isGlobalIdentifier", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.kindOfIdent({
        name: "myVar",
        isGlobalIdentifier: true
    });

    assert.strictEqual(result, "global_field");
});

void test("BasicSemanticOracle: kindOfIdent returns 'builtin' for known builtin", () => {
    const builtins = new Set(["array_length", "string_upper"]);
    const oracle = new BasicSemanticOracle(null, builtins);

    const result = oracle.kindOfIdent({ name: "array_length" });

    assert.strictEqual(result, "builtin");
});

void test("BasicSemanticOracle: kindOfIdent resolves local variable from scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("localVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "localVar" });

    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: kindOfIdent returns 'global_field' for global classification", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare(
        "globalVar",
        {
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        },
        { tags: ["global"] }
    );

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "globalVar" });

    assert.strictEqual(result, "global_field");
});

void test("BasicSemanticOracle: kindOfIdent defaults to 'local' for unresolved identifier", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "unknownVar" });

    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: kindOfIdent prioritizes isGlobalIdentifier over scope resolution", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("myVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 5 }
    });

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({
        name: "myVar",
        isGlobalIdentifier: true
    });

    assert.strictEqual(result, "global_field");
});

void test("BasicSemanticOracle: kindOfIdent prioritizes builtins over scope resolution", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("show_debug_message", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 18 }
    });

    const builtins = new Set(["show_debug_message"]);
    const oracle = new BasicSemanticOracle(tracker, builtins);

    const result = oracle.kindOfIdent({ name: "show_debug_message" });

    assert.strictEqual(result, "builtin");
});

void test("BasicSemanticOracle: nameOfIdent returns empty string for null", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.nameOfIdent(null);

    assert.strictEqual(result, "");
});

void test("BasicSemanticOracle: nameOfIdent returns name from node", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.nameOfIdent({ name: "myFunction" });

    assert.strictEqual(result, "myFunction");
});

void test("BasicSemanticOracle: qualifiedSymbol returns null", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.qualifiedSymbol({ name: "myVar" });

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: callTargetKind returns 'unknown' for null callee", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.callTargetKind({
        type: "CallExpression",
        object: null
    });

    assert.strictEqual(result, "unknown");
});

void test("BasicSemanticOracle: callTargetKind returns 'builtin' for known builtin", () => {
    const builtins = new Set(["show_debug_message", "draw_text"]);
    const oracle = new BasicSemanticOracle(null, builtins);

    const result = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "draw_text" }
    });

    assert.strictEqual(result, "builtin");
});

void test("BasicSemanticOracle: callTargetKind returns 'unknown' for non-builtin", () => {
    const builtins = new Set(["show_debug_message"]);
    const oracle = new BasicSemanticOracle(null, builtins);

    const result = oracle.callTargetKind({
        type: "CallExpression",
        object: { name: "my_custom_script" }
    });

    assert.strictEqual(result, "unknown");
});

void test("BasicSemanticOracle: callTargetSymbol returns null", () => {
    const oracle = new BasicSemanticOracle(null);

    const result = oracle.callTargetSymbol({
        type: "CallExpression",
        object: { name: "my_script" }
    });

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: works without tracker (null fallback)", () => {
    const oracle = new BasicSemanticOracle(null);

    const kindResult = oracle.kindOfIdent({ name: "someVar" });
    const nameResult = oracle.nameOfIdent({ name: "someVar" });

    assert.strictEqual(kindResult, "local");
    assert.strictEqual(nameResult, "someVar");
});

void test("BasicSemanticOracle: resolves shadowed variables correctly", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare(
        "x",
        {
            start: { line: 1, index: 0 },
            end: { line: 1, index: 1 }
        },
        { tags: ["global"] }
    );

    tracker.enterScope("function");

    tracker.declare("x", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 1 }
    });

    const oracle = new BasicSemanticOracle(tracker);

    const result = oracle.kindOfIdent({ name: "x" });

    assert.strictEqual(result, "local");
});

void test("BasicSemanticOracle: classification priority is correct", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("func", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 4 }
    });

    const builtins = new Set(["func"]);
    const oracle = new BasicSemanticOracle(tracker, builtins);

    const globalResult = oracle.kindOfIdent({
        name: "func",
        isGlobalIdentifier: true
    });
    assert.strictEqual(globalResult, "global_field");

    const builtinResult = oracle.kindOfIdent({ name: "func" });
    assert.strictEqual(builtinResult, "builtin");
});
