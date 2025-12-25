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

void test("BasicSemanticOracle: kindOfIdent returns 'script' for known script", () => {
    const scripts = new Set(["scr_player_move", "scr_enemy_attack"]);
    const oracle = new BasicSemanticOracle(null, new Set(), scripts);

    const result = oracle.kindOfIdent({ name: "scr_player_move" });

    assert.strictEqual(result, "script");
});

void test("BasicSemanticOracle: kindOfIdent prioritizes scripts correctly", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("scr_test", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const scripts = new Set(["scr_test"]);
    const oracle = new BasicSemanticOracle(tracker, new Set(), scripts);

    const result = oracle.kindOfIdent({ name: "scr_test" });

    assert.strictEqual(result, "script");
});

void test("BasicSemanticOracle: qualifiedSymbol returns SCIP symbol for scripts", () => {
    const scripts = new Set(["scr_player_move"]);
    const oracle = new BasicSemanticOracle(null, new Set(), scripts);

    const result = oracle.qualifiedSymbol({ name: "scr_player_move" });

    assert.strictEqual(result, "gml/script/scr_player_move");
});

void test("BasicSemanticOracle: qualifiedSymbol returns SCIP symbol for global variables", () => {
    const oracle = new BasicSemanticOracle(null, new Set(), new Set());

    const result = oracle.qualifiedSymbol({
        name: "global_score",
        isGlobalIdentifier: true
    });

    assert.strictEqual(result, "gml/var/global::global_score");
});

void test("BasicSemanticOracle: qualifiedSymbol returns SCIP symbol for builtins", () => {
    const builtins = new Set(["array_length"]);
    const oracle = new BasicSemanticOracle(null, builtins, new Set());

    const result = oracle.qualifiedSymbol({ name: "array_length" });

    assert.strictEqual(result, "gml/macro/array_length");
});

void test("BasicSemanticOracle: qualifiedSymbol returns null for local variables", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.declare("localVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const oracle = new BasicSemanticOracle(tracker, new Set(), new Set());

    const result = oracle.qualifiedSymbol({ name: "localVar" });

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: qualifiedSymbol returns null for null input", () => {
    const oracle = new BasicSemanticOracle(null, new Set(), new Set());

    const result = oracle.qualifiedSymbol(null);

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: callTargetKind returns 'script' for known scripts", () => {
    const scripts = new Set(["scr_damage_player"]);
    const oracle = new BasicSemanticOracle(null, new Set(), scripts);

    const node = {
        type: "CallExpression" as const,
        object: { name: "scr_damage_player" }
    };

    const result = oracle.callTargetKind(node);

    assert.strictEqual(result, "script");
});

void test("BasicSemanticOracle: callTargetSymbol returns SCIP symbol for script calls", () => {
    const scripts = new Set(["scr_attack"]);
    const oracle = new BasicSemanticOracle(null, new Set(), scripts);

    const node = {
        type: "CallExpression" as const,
        object: { name: "scr_attack" }
    };

    const result = oracle.callTargetSymbol(node);

    assert.strictEqual(result, "gml/script/scr_attack");
});

void test("BasicSemanticOracle: callTargetSymbol returns SCIP symbol for builtin calls", () => {
    const builtins = new Set(["show_debug_message"]);
    const oracle = new BasicSemanticOracle(null, builtins, new Set());

    const node = {
        type: "CallExpression" as const,
        object: { name: "show_debug_message" }
    };

    const result = oracle.callTargetSymbol(node);

    assert.strictEqual(result, "gml/macro/show_debug_message");
});

void test("BasicSemanticOracle: callTargetSymbol returns null for unknown calls", () => {
    const oracle = new BasicSemanticOracle(null, new Set(), new Set());

    const node = {
        type: "CallExpression" as const,
        object: { name: "unknown_function" }
    };

    const result = oracle.callTargetSymbol(node);

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: callTargetSymbol returns null for non-identifier object", () => {
    const oracle = new BasicSemanticOracle(null, new Set(), new Set());

    const node = {
        type: "CallExpression" as const,
        object: { type: "MemberExpression" }
    };

    const result = oracle.callTargetSymbol(node);

    assert.strictEqual(result, null);
});

void test("BasicSemanticOracle: SCIP symbols enable hot reload dependency tracking", () => {
    const scripts = new Set(["scr_init_game", "scr_update_player"]);
    const builtins = new Set(["instance_create_depth"]);
    const oracle = new BasicSemanticOracle(null, builtins, scripts);

    const scriptSymbol = oracle.qualifiedSymbol({ name: "scr_init_game" });
    assert.strictEqual(scriptSymbol, "gml/script/scr_init_game");

    const globalSymbol = oracle.qualifiedSymbol({
        name: "player_hp",
        isGlobalIdentifier: true
    });
    assert.strictEqual(globalSymbol, "gml/var/global::player_hp");

    const callNode = {
        type: "CallExpression" as const,
        object: { name: "instance_create_depth" }
    };
    const builtinSymbol = oracle.callTargetSymbol(callNode);
    assert.strictEqual(builtinSymbol, "gml/macro/instance_create_depth");
});
