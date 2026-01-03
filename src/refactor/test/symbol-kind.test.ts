import assert from "node:assert/strict";
import test from "node:test";
import { SymbolKind, isSymbolKind, parseSymbolKind, requireSymbolKind, type SymbolKindValue } from "../src/types.js";

void test("SymbolKind enum contains expected values", () => {
    assert.equal(SymbolKind.SCRIPT, "script");
    assert.equal(SymbolKind.VAR, "var");
    assert.equal(SymbolKind.EVENT, "event");
    assert.equal(SymbolKind.MACRO, "macro");
    assert.equal(SymbolKind.ENUM, "enum");
});

void test("SymbolKind enum is frozen", () => {
    assert.ok(Object.isFrozen(SymbolKind));
});

void test("isSymbolKind returns true for valid symbol kinds", () => {
    assert.ok(isSymbolKind("script"));
    assert.ok(isSymbolKind("var"));
    assert.ok(isSymbolKind("event"));
    assert.ok(isSymbolKind("macro"));
    assert.ok(isSymbolKind("enum"));
});

void test("isSymbolKind returns false for invalid symbol kinds", () => {
    assert.ok(!isSymbolKind("invalid"));
    assert.ok(!isSymbolKind("function"));
    assert.ok(!isSymbolKind("class"));
    assert.ok(!isSymbolKind(""));
    assert.ok(!isSymbolKind(null));
    assert.ok(!isSymbolKind(undefined));
    assert.ok(!isSymbolKind(123));
    assert.ok(!isSymbolKind({}));
    assert.ok(!isSymbolKind([]));
});

void test("isSymbolKind is case-sensitive", () => {
    assert.ok(!isSymbolKind("SCRIPT"));
    assert.ok(!isSymbolKind("Script"));
    assert.ok(!isSymbolKind("VAR"));
    assert.ok(!isSymbolKind("Var"));
});

void test("parseSymbolKind returns valid symbol kind for valid input", () => {
    assert.equal(parseSymbolKind("script"), "script");
    assert.equal(parseSymbolKind("var"), "var");
    assert.equal(parseSymbolKind("event"), "event");
    assert.equal(parseSymbolKind("macro"), "macro");
    assert.equal(parseSymbolKind("enum"), "enum");
});

void test("parseSymbolKind returns null for invalid input", () => {
    assert.equal(parseSymbolKind("invalid"), null);
    assert.equal(parseSymbolKind("function"), null);
    assert.equal(parseSymbolKind(""), null);
    assert.equal(parseSymbolKind(null), null);
    assert.equal(parseSymbolKind(undefined), null);
    assert.equal(parseSymbolKind(123), null);
    assert.equal(parseSymbolKind({}), null);
});

void test("requireSymbolKind returns valid symbol kind for valid input", () => {
    assert.equal(requireSymbolKind("script"), "script");
    assert.equal(requireSymbolKind("var"), "var");
    assert.equal(requireSymbolKind("event"), "event");
    assert.equal(requireSymbolKind("macro"), "macro");
    assert.equal(requireSymbolKind("enum"), "enum");
});

void test("requireSymbolKind throws TypeError for invalid symbol kind", () => {
    assert.throws(() => requireSymbolKind("invalid"), {
        name: "TypeError",
        message: /Invalid symbol kind.*Must be one of: script, var, event, macro, enum/
    });
});

void test("requireSymbolKind throws TypeError for non-string input", () => {
    assert.throws(() => requireSymbolKind(123), {
        name: "TypeError",
        message: /Invalid symbol kind/
    });
    assert.throws(() => requireSymbolKind(null), {
        name: "TypeError",
        message: /Invalid symbol kind/
    });
    assert.throws(() => requireSymbolKind(undefined), {
        name: "TypeError",
        message: /Invalid symbol kind/
    });
});

void test("requireSymbolKind includes context in error message", () => {
    assert.throws(() => requireSymbolKind("invalid", "gml/invalid/test"), {
        name: "TypeError",
        message: /in gml\/invalid\/test/
    });
});

void test("requireSymbolKind error message includes received value", () => {
    assert.throws(() => requireSymbolKind("bad_kind"), {
        name: "TypeError",
        message: /"bad_kind"/
    });
});

void test("SymbolKindValue type accepts all valid kinds", () => {
    const kinds: Array<SymbolKindValue> = [
        SymbolKind.SCRIPT,
        SymbolKind.VAR,
        SymbolKind.EVENT,
        SymbolKind.MACRO,
        SymbolKind.ENUM
    ];
    assert.equal(kinds.length, 5);
});

void test("parseSymbolKind can be used in control flow narrowing", () => {
    const rawKind: string = "script";
    const kind = parseSymbolKind(rawKind);

    if (kind !== null) {
        // Type should be narrowed to SymbolKindValue here
        const _typeCheck: SymbolKindValue = kind;
        assert.ok(_typeCheck);
    }
});

void test("isSymbolKind can be used as type guard", () => {
    const rawKind: unknown = "script";

    if (isSymbolKind(rawKind)) {
        // Type should be narrowed to SymbolKindValue here
        const _typeCheck: SymbolKindValue = rawKind;
        assert.ok(_typeCheck);
    }
});
