import assert from "node:assert/strict";
import test from "node:test";

import { Transpiler } from "../index.js";
import type { CallExpressionNode, IdentifierMetadata } from "../src/emitter/ast.js";

/**
 * Create a minimal `IdentifierMetadata` node for testing.
 */
function ident(name: string, isGlobal = false): IdentifierMetadata {
    return isGlobal ? { name, isGlobalIdentifier: true } : { name };
}

/**
 * Create a minimal `CallExpressionNode` for testing.
 */
function callExpr(calleeName: string): CallExpressionNode {
    return {
        type: "CallExpression" as const,
        object: { type: "Identifier" as const, name: calleeName },
        arguments: []
    } as unknown as CallExpressionNode;
}

void test("EventContextOracle classifies declared locals as local", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set(["speed", "dx", "dy"]));

    assert.equal(oracle.kindOfIdent(ident("speed")), "local");
    assert.equal(oracle.kindOfIdent(ident("dx")), "local");
    assert.equal(oracle.kindOfIdent(ident("dy")), "local");
});

void test("EventContextOracle promotes undeclared identifiers to self_field", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set(["speed"]));

    assert.equal(oracle.kindOfIdent(ident("x")), "self_field", "x is undeclared → self_field");
    assert.equal(oracle.kindOfIdent(ident("hp")), "self_field", "hp is undeclared → self_field");
    assert.equal(oracle.kindOfIdent(ident("sprite_index")), "self_field", "sprite_index → self_field");
});

void test("EventContextOracle preserves builtin classification", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.kindOfIdent(ident("abs")), "builtin", "abs should remain builtin");
    assert.equal(oracle.kindOfIdent(ident("sqrt")), "builtin", "sqrt should remain builtin");
    assert.equal(oracle.kindOfIdent(ident("lengthdir_x")), "builtin", "lengthdir_x should remain builtin");
});

void test("EventContextOracle preserves script classification", () => {
    const base = Transpiler.createSemanticOracle({ scriptNames: new Set(["scr_attack", "scr_move"]) });
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.kindOfIdent(ident("scr_attack")), "script", "scr_attack should remain script");
    assert.equal(oracle.kindOfIdent(ident("scr_move")), "script", "scr_move should remain script");
});

void test("EventContextOracle preserves global_field classification for flagged identifiers", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.kindOfIdent(ident("myGlobal", true)), "global_field", "isGlobalIdentifier → global_field");
});

void test("EventContextOracle returns local for null/empty node", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.kindOfIdent(null), "local");
    assert.equal(oracle.kindOfIdent(undefined), "local");
    assert.equal(oracle.kindOfIdent({ name: "" }), "local");
});

void test("EventContextOracle prefers local over self_field when name is in locals", () => {
    const base = Transpiler.createSemanticOracle();
    // Even if the base would upgrade to self_field (it won't but conceptually),
    // locals set always wins.
    const oracle = new Transpiler.EventContextOracle(base, new Set(["hp"]));

    assert.equal(oracle.kindOfIdent(ident("hp")), "local", "hp in locals set → local, not self_field");
});

void test("EventContextOracle delegates nameOfIdent to base oracle", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.nameOfIdent(ident("myVar")), "myVar");
    assert.equal(oracle.nameOfIdent(null), "");
});

void test("EventContextOracle delegates qualifiedSymbol to base oracle", () => {
    const base = Transpiler.createSemanticOracle({ scriptNames: new Set(["scr_test"]) });
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    const symbol = oracle.qualifiedSymbol(ident("scr_test"));
    assert.ok(symbol?.includes("script"), "Script symbol should include 'script'");
    assert.ok(symbol?.includes("scr_test"), "Script symbol should include script name");
});

void test("EventContextOracle delegates callTargetKind to base oracle", () => {
    const base = Transpiler.createSemanticOracle({ scriptNames: new Set(["scr_run"]) });
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    assert.equal(oracle.callTargetKind(callExpr("abs")), "builtin");
    assert.equal(oracle.callTargetKind(callExpr("scr_run")), "script");
    assert.equal(oracle.callTargetKind(callExpr("unknown_fn")), "unknown");
});

void test("EventContextOracle delegates callTargetSymbol to base oracle", () => {
    const base = Transpiler.createSemanticOracle({ scriptNames: new Set(["scr_run"]) });
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    const symbol = oracle.callTargetSymbol(callExpr("scr_run"));
    assert.ok(symbol?.includes("script"), "Should generate symbol for script");
    assert.ok(symbol?.includes("scr_run"), "Symbol should include script name");
});

void test("EventContextOracle empty locals set promotes all unknown identifiers to self_field", () => {
    const base = Transpiler.createSemanticOracle();
    const oracle = new Transpiler.EventContextOracle(base, new Set<string>());

    // These are neither builtins nor scripts, so they should be self_field
    assert.equal(oracle.kindOfIdent(ident("x")), "self_field");
    assert.equal(oracle.kindOfIdent(ident("y")), "self_field");
    assert.equal(oracle.kindOfIdent(ident("image_index")), "self_field");
});
