import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("declarationKind is tracked in metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("myVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 5 } }, { kind: "variable" });

    tracker.declare("myFunc", { start: { line: 2, index: 0 }, end: { line: 2, index: 6 } }, { kind: "function" });

    tracker.declare("myParam", { start: { line: 3, index: 0 }, end: { line: 3, index: 7 } }, { kind: "parameter" });

    tracker.exitScope();

    const allDeclarations = tracker.getAllDeclarations();

    const varDecl = allDeclarations.find((d) => d.name === "myVar");
    assert.ok(varDecl);
    assert.strictEqual(varDecl.metadata?.declarationKind, "variable");

    const funcDecl = allDeclarations.find((d) => d.name === "myFunc");
    assert.ok(funcDecl);
    assert.strictEqual(funcDecl.metadata?.declarationKind, "function");

    const paramDecl = allDeclarations.find((d) => d.name === "myParam");
    assert.ok(paramDecl);
    assert.strictEqual(paramDecl.metadata?.declarationKind, "parameter");
});

void test("declarationKind is null when kind not provided", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("noKind", { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } }, {});

    tracker.exitScope();

    const declarations = tracker.getAllDeclarations();
    const decl = declarations.find((d) => d.name === "noKind");
    assert.ok(decl);
    assert.strictEqual(decl.metadata?.declarationKind, null);
});

void test("getDeclarationsByKind returns only matching declarations", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("var1", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } }, { kind: "variable" });
    tracker.declare("var2", { start: { line: 2, index: 0 }, end: { line: 2, index: 4 } }, { kind: "variable" });
    tracker.declare("func1", { start: { line: 3, index: 0 }, end: { line: 3, index: 5 } }, { kind: "function" });
    tracker.declare("param1", { start: { line: 4, index: 0 }, end: { line: 4, index: 6 } }, { kind: "parameter" });

    tracker.exitScope();

    const variables = tracker.getDeclarationsByKind("variable");
    assert.strictEqual(variables.length, 2);
    assert.ok(variables.every((v) => v.metadata?.declarationKind === "variable"));
    assert.ok(variables.some((v) => v.name === "var1"));
    assert.ok(variables.some((v) => v.name === "var2"));

    const functions = tracker.getDeclarationsByKind("function");
    assert.strictEqual(functions.length, 1);
    assert.strictEqual(functions[0].name, "func1");

    const parameters = tracker.getDeclarationsByKind("parameter");
    assert.strictEqual(parameters.length, 1);
    assert.strictEqual(parameters[0].name, "param1");
});

void test("getDeclarationsByKind returns empty array for unknown kind", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    tracker.declare("var1", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } }, { kind: "variable" });

    tracker.exitScope();

    const result = tracker.getDeclarationsByKind("unknown");
    assert.deepStrictEqual(result, []);
});

void test("getDeclarationsByKind returns empty array for null kind", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const result = tracker.getDeclarationsByKind(null);
    assert.deepStrictEqual(result, []);
});

void test("getDeclarationsByKind searches across multiple scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("globalVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } }, { kind: "variable" });

    tracker.enterScope("function");
    tracker.declare("localVar", { start: { line: 2, index: 0 }, end: { line: 2, index: 8 } }, { kind: "variable" });
    tracker.declare("param", { start: { line: 3, index: 0 }, end: { line: 3, index: 5 } }, { kind: "parameter" });

    tracker.enterScope("block");
    tracker.declare("blockVar", { start: { line: 4, index: 0 }, end: { line: 4, index: 8 } }, { kind: "variable" });
    tracker.exitScope();

    tracker.exitScope();
    tracker.exitScope();

    const variables = tracker.getDeclarationsByKind("variable");
    assert.strictEqual(variables.length, 3);
    assert.ok(variables.some((v) => v.name === "globalVar" && v.scopeId === "scope-0"));
    assert.ok(variables.some((v) => v.name === "localVar" && v.scopeId === "scope-1"));
    assert.ok(variables.some((v) => v.name === "blockVar" && v.scopeId === "scope-2"));
});

void test("getDeclarationsByKind results are sorted by scope ID then name", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("zVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } }, { kind: "variable" });
    tracker.declare("aVar", { start: { line: 2, index: 0 }, end: { line: 2, index: 4 } }, { kind: "variable" });

    tracker.enterScope("function");
    tracker.declare("mVar", { start: { line: 3, index: 0 }, end: { line: 3, index: 4 } }, { kind: "variable" });
    tracker.exitScope();

    tracker.exitScope();

    const variables = tracker.getDeclarationsByKind("variable");
    assert.strictEqual(variables.length, 3);
    // Should be sorted by scope ID first (scope-0, scope-1), then by name
    assert.strictEqual(variables[0].name, "aVar");
    assert.strictEqual(variables[0].scopeId, "scope-0");
    assert.strictEqual(variables[1].name, "zVar");
    assert.strictEqual(variables[1].scopeId, "scope-0");
    assert.strictEqual(variables[2].name, "mVar");
    assert.strictEqual(variables[2].scopeId, "scope-1");
});

void test("getScopeDeclarationKindStats returns statistics for a scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("var1", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } }, { kind: "variable" });
    tracker.declare("var2", { start: { line: 2, index: 0 }, end: { line: 2, index: 4 } }, { kind: "variable" });
    tracker.declare("var3", { start: { line: 3, index: 0 }, end: { line: 3, index: 4 } }, { kind: "variable" });
    tracker.declare("func1", { start: { line: 4, index: 0 }, end: { line: 4, index: 5 } }, { kind: "function" });
    tracker.declare("param1", { start: { line: 5, index: 0 }, end: { line: 5, index: 6 } }, { kind: "parameter" });

    tracker.exitScope();

    const stats = tracker.getScopeDeclarationKindStats(scope.id);
    assert.ok(stats);
    assert.strictEqual(stats.total, 5);
    assert.strictEqual(stats.byKind.get("variable"), 3);
    assert.strictEqual(stats.byKind.get("function"), 1);
    assert.strictEqual(stats.byKind.get("parameter"), 1);
});

void test("getScopeDeclarationKindStats handles scope with no declarations", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");
    tracker.exitScope();

    const stats = tracker.getScopeDeclarationKindStats(scope.id);
    assert.ok(stats);
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.byKind.size, 0);
});

void test("getScopeDeclarationKindStats returns null for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const stats = tracker.getScopeDeclarationKindStats("non-existent");
    assert.strictEqual(stats, null);
});

void test("getScopeDeclarationKindStats returns null for null scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const stats = tracker.getScopeDeclarationKindStats(null);
    assert.strictEqual(stats, null);
});

void test("getScopeDeclarationKindStats counts 'unknown' for declarations without kind", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("var1", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } }, { kind: "variable" });
    tracker.declare("noKind", { start: { line: 2, index: 0 }, end: { line: 2, index: 6 } }, {});

    tracker.exitScope();

    const stats = tracker.getScopeDeclarationKindStats(scope.id);
    assert.ok(stats);
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.byKind.get("variable"), 1);
    assert.strictEqual(stats.byKind.get("unknown"), 1);
});

void test("getScopeDeclarationKindStats only counts declarations in specified scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const outerScope = tracker.enterScope("program");
    tracker.declare("outer1", { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } }, { kind: "variable" });
    tracker.declare("outer2", { start: { line: 2, index: 0 }, end: { line: 2, index: 6 } }, { kind: "variable" });

    const innerScope = tracker.enterScope("function");
    tracker.declare("inner1", { start: { line: 3, index: 0 }, end: { line: 3, index: 6 } }, { kind: "parameter" });
    tracker.exitScope();

    tracker.exitScope();

    const outerStats = tracker.getScopeDeclarationKindStats(outerScope.id);
    assert.ok(outerStats);
    assert.strictEqual(outerStats.total, 2);
    assert.strictEqual(outerStats.byKind.get("variable"), 2);
    assert.strictEqual(outerStats.byKind.get("parameter"), undefined);

    const innerStats = tracker.getScopeDeclarationKindStats(innerScope.id);
    assert.ok(innerStats);
    assert.strictEqual(innerStats.total, 1);
    assert.strictEqual(innerStats.byKind.get("parameter"), 1);
    assert.strictEqual(innerStats.byKind.get("variable"), undefined);
});

void test("declaration kind metadata enables hot reload optimization", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("GameState", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } }, { kind: "variable" });

    const funcScope = tracker.enterScope("function");
    tracker.declare("x", { start: { line: 3, index: 0 }, end: { line: 3, index: 1 } }, { kind: "parameter" });
    tracker.declare("y", { start: { line: 3, index: 3 }, end: { line: 3, index: 4 } }, { kind: "parameter" });
    tracker.declare("local", { start: { line: 4, index: 0 }, end: { line: 4, index: 5 } }, { kind: "variable" });
    tracker.exitScope();

    tracker.exitScope();

    // Simulate hot reload: find all function parameters to validate arity
    const allParameters = tracker.getDeclarationsByKind("parameter");
    assert.strictEqual(allParameters.length, 2);
    assert.ok(allParameters.every((p) => p.scopeId === funcScope.id));

    // Simulate hot reload: get function scope stats to determine recompilation strategy
    const stats = tracker.getScopeDeclarationKindStats(funcScope.id);
    assert.ok(stats);
    assert.strictEqual(stats.byKind.get("parameter"), 2);
    assert.strictEqual(stats.byKind.get("variable"), 1);

    // If scope has parameters, hot reload may need to rebuild function signature
    const hasParameters = (stats.byKind.get("parameter") ?? 0) > 0;
    assert.strictEqual(hasParameters, true);
});
