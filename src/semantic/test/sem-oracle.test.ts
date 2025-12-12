import test from "node:test";
import assert from "node:assert/strict";

import {
    kindOfIdent,
    nameOfIdent,
    qualifiedSymbol,
    callTargetKind,
    callTargetSymbol
} from "../src/symbols/sem-oracle.js";

void test("kindOfIdent returns 'builtin' for builtin identifiers", () => {
    const node = {
        name: "show_debug_message",
        isBuiltIn: true,
        classifications: ["identifier", "reference", "builtin"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "builtin");
});

void test("kindOfIdent returns 'script' for script identifiers", () => {
    const node = {
        name: "scr_player_attack",
        classifications: ["identifier", "declaration", "script"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "script");
});

void test("kindOfIdent returns 'macro' for macro identifiers", () => {
    const node = {
        name: "MAX_HEALTH",
        classifications: ["identifier", "reference", "macro"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "macro");
});

void test("kindOfIdent returns 'enum' for enum identifiers", () => {
    const node = {
        name: "EnemyType",
        classifications: ["identifier", "declaration", "enum"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "enum");
});

void test("kindOfIdent returns 'enum-member' for enum member identifiers", () => {
    const node = {
        name: "GOBLIN",
        classifications: ["identifier", "reference", "enum-member"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "enum-member");
});

void test("kindOfIdent returns 'global' for global variables", () => {
    const node = {
        name: "global_score",
        classifications: ["identifier", "reference", "variable", "global"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "global");
});

void test("kindOfIdent returns 'instance' for instance variables", () => {
    const node = {
        name: "hp",
        classifications: ["identifier", "reference", "variable", "instance"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "instance");
});

void test("kindOfIdent returns 'local' for local variables", () => {
    const node = {
        name: "tempValue",
        classifications: ["identifier", "declaration", "variable"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "local");
});

void test("kindOfIdent returns 'local' for parameters", () => {
    const node = {
        name: "arg1",
        classifications: ["identifier", "declaration", "parameter"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "local");
});

void test("kindOfIdent returns 'local' as default for unknown classifications", () => {
    const node = {
        name: "unknown",
        classifications: ["identifier"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "local");
});

void test("kindOfIdent returns 'unknown' for non-object input", () => {
    assert.strictEqual(kindOfIdent(null), "unknown");
    assert.strictEqual(kindOfIdent(), "unknown");
    assert.strictEqual(kindOfIdent("string"), "unknown");
    assert.strictEqual(kindOfIdent(42), "unknown");
});

void test("kindOfIdent prioritizes builtin over other classifications", () => {
    const node = {
        name: "builtin_script",
        isBuiltIn: true,
        classifications: ["identifier", "script", "builtin"]
    };

    const result = kindOfIdent(node);

    assert.strictEqual(result, "builtin");
});

void test("nameOfIdent returns name from direct property", () => {
    const node = { name: "testIdentifier" };

    const result = nameOfIdent(node);

    assert.strictEqual(result, "testIdentifier");
});

void test("nameOfIdent returns name from nested identifier", () => {
    const node = {
        identifier: { name: "nestedName" }
    };

    const result = nameOfIdent(node);

    assert.strictEqual(result, "nestedName");
});

void test("nameOfIdent returns empty string for missing name", () => {
    const node = { classifications: ["identifier"] };

    const result = nameOfIdent(node);

    assert.strictEqual(result, "");
});

void test("nameOfIdent returns empty string for non-object input", () => {
    assert.strictEqual(nameOfIdent(null), "");
    assert.strictEqual(nameOfIdent(), "");
    assert.strictEqual(nameOfIdent("string"), "");
});

void test("qualifiedSymbol returns qualified path for scoped symbol", () => {
    const node = {
        name: "localVar",
        scopeId: "scope-1",
        classifications: ["identifier", "declaration", "variable"]
    };

    const result = qualifiedSymbol(node);

    assert.strictEqual(result, "local/scope-1/localVar");
});

void test("qualifiedSymbol returns qualified path without scope for global", () => {
    const node = {
        name: "global_config",
        classifications: ["identifier", "reference", "variable", "global"]
    };

    const result = qualifiedSymbol(node);

    assert.strictEqual(result, "global/global_config");
});

void test("qualifiedSymbol uses declaration scopeId when available", () => {
    const node = {
        name: "refVar",
        scopeId: "scope-2",
        declaration: { scopeId: "scope-1" },
        classifications: ["identifier", "reference", "variable"]
    };

    const result = qualifiedSymbol(node);

    assert.strictEqual(result, "local/scope-2/refVar");
});

void test("qualifiedSymbol returns null for node without name", () => {
    const node = {
        classifications: ["identifier"]
    };

    const result = qualifiedSymbol(node);

    assert.strictEqual(result, null);
});

void test("qualifiedSymbol returns null for non-object input", () => {
    assert.strictEqual(qualifiedSymbol(null), null);
    assert.strictEqual(qualifiedSymbol(), null);
});

void test("qualifiedSymbol handles script declarations correctly", () => {
    const node = {
        name: "scr_init",
        scopeId: "scope-0",
        classifications: ["identifier", "declaration", "script"]
    };

    const result = qualifiedSymbol(node);

    assert.strictEqual(result, "script/scope-0/scr_init");
});

void test("callTargetKind returns 'builtin' for builtin functions", () => {
    const node = {
        callee: {
            name: "array_length",
            isBuiltIn: true,
            classifications: ["identifier", "reference", "builtin"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "builtin");
});

void test("callTargetKind returns 'script' for script calls", () => {
    const node = {
        callee: {
            name: "scr_attack",
            classifications: ["identifier", "reference", "script"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "script");
});

void test("callTargetKind returns 'method' for method calls", () => {
    const node = {
        callee: {
            name: "update",
            classifications: ["identifier", "reference", "method"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "method");
});

void test("callTargetKind returns 'constructor' for constructor calls", () => {
    const node = {
        callee: {
            name: "Enemy",
            classifications: ["identifier", "reference", "constructor"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "constructor");
});

void test("callTargetKind infers constructor from PascalCase identifier", () => {
    const node = {
        callee: {
            type: "Identifier",
            name: "GameObject"
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "constructor");
});

void test("callTargetKind returns 'unknown' for lowercase identifier without classification", () => {
    const node = {
        callee: {
            type: "Identifier",
            name: "unknownCall"
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "unknown");
});

void test("callTargetKind handles 'function' property as alias for callee", () => {
    const node = {
        function: {
            name: "execute",
            classifications: ["identifier", "reference", "script"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "script");
});

void test("callTargetKind handles 'target' property as alias for callee", () => {
    const node = {
        target: {
            name: "callback",
            classifications: ["identifier", "reference", "method"]
        }
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "method");
});

void test("callTargetKind returns 'unknown' for non-object input", () => {
    assert.strictEqual(callTargetKind(null), "unknown");
    assert.strictEqual(callTargetKind(), "unknown");
});

void test("callTargetKind returns 'unknown' when callee is missing", () => {
    const node = {
        type: "CallExpression"
    };

    const result = callTargetKind(node);

    assert.strictEqual(result, "unknown");
});

void test("callTargetSymbol returns qualified symbol for script call", () => {
    const node = {
        callee: {
            name: "scr_init_player",
            scopeId: "scope-0",
            classifications: ["identifier", "reference", "script"]
        }
    };

    const result = callTargetSymbol(node);

    assert.strictEqual(result, "script/scope-0/scr_init_player");
});

void test("callTargetSymbol returns qualified symbol for builtin call", () => {
    const node = {
        callee: {
            name: "show_message",
            isBuiltIn: true,
            classifications: ["identifier", "reference", "builtin"]
        }
    };

    const result = callTargetSymbol(node);

    assert.strictEqual(result, "builtin/show_message");
});

void test("callTargetSymbol returns null when callee has no name", () => {
    const node = {
        callee: {
            classifications: ["identifier"]
        }
    };

    const result = callTargetSymbol(node);

    assert.strictEqual(result, null);
});

void test("callTargetSymbol returns null for non-object input", () => {
    assert.strictEqual(callTargetSymbol(null), null);
    assert.strictEqual(callTargetSymbol(), null);
});

void test("callTargetSymbol handles 'function' property as alias", () => {
    const node = {
        function: {
            name: "helper",
            scopeId: "scope-1",
            classifications: ["identifier", "reference", "script"]
        }
    };

    const result = callTargetSymbol(node);

    assert.strictEqual(result, "script/scope-1/helper");
});

void test("integration: sem-oracle provides hot reload metadata", () => {
    const scriptNode = {
        name: "scr_player_move",
        scopeId: "scope-script-1",
        classifications: ["identifier", "declaration", "script"]
    };

    const callNode = {
        callee: {
            name: "scr_player_move",
            scopeId: "scope-2",
            declaration: { scopeId: "scope-script-1" },
            classifications: ["identifier", "reference", "script"]
        }
    };

    const declKind = kindOfIdent(scriptNode);
    const declSymbol = qualifiedSymbol(scriptNode);
    const targetKind = callTargetKind(callNode);
    const targetSymbol = callTargetSymbol(callNode);

    assert.strictEqual(declKind, "script");
    assert.strictEqual(declSymbol, "script/scope-script-1/scr_player_move");
    assert.strictEqual(targetKind, "script");
    assert.strictEqual(targetSymbol, "script/scope-2/scr_player_move");
});
