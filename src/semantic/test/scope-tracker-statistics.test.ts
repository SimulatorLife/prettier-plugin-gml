import test from "node:test";
import assert from "node:assert/strict";
import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("getScopeStatistics returns null for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const stats = tracker.getScopeStatistics("non-existent");

    assert.strictEqual(stats, null);
});

void test("getScopeStatistics returns null for null scopeId", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const stats = tracker.getScopeStatistics(null);

    assert.strictEqual(stats, null);
});

void test("getScopeStatistics returns null for undefined scopeId", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const stats = tracker.getScopeStatistics();

    assert.strictEqual(stats, null);
});

void test("getScopeStatistics returns basic statistics for empty scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    const stats = tracker.getScopeStatistics(scope.id);

    assert.ok(stats);
    assert.strictEqual(stats.scopeId, scope.id);
    assert.strictEqual(stats.scopeKind, "program");
    assert.strictEqual(stats.depth, 0);
    assert.strictEqual(stats.symbolCount, 0);
    assert.strictEqual(stats.declarationCount, 0);
    assert.strictEqual(stats.referenceCount, 0);
    assert.strictEqual(stats.externalReferenceCount, 0);
    assert.deepStrictEqual(stats.symbols, []);
});

void test("getScopeStatistics counts declarations correctly", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    const node1 = { type: "Identifier", name: "foo", start: 0, end: 3 };
    const node2 = { type: "Identifier", name: "bar", start: 10, end: 13 };

    tracker.declare("foo", node1);
    tracker.declare("bar", node2);

    const stats = tracker.getScopeStatistics(scope.id);

    assert.ok(stats);
    assert.strictEqual(stats.symbolCount, 2);
    assert.strictEqual(stats.declarationCount, 2);
    assert.strictEqual(stats.referenceCount, 0);
    assert.strictEqual(stats.externalReferenceCount, 0);
    assert.strictEqual(stats.symbols.length, 2);

    const fooSymbol = stats.symbols.find((s) => s.name === "foo");
    assert.ok(fooSymbol);
    assert.strictEqual(fooSymbol.hasDeclaration, true);
    assert.strictEqual(fooSymbol.hasReference, false);
    assert.strictEqual(fooSymbol.declarationCount, 1);
    assert.strictEqual(fooSymbol.referenceCount, 0);
});

void test("getScopeStatistics counts references correctly", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    const declNode = { type: "Identifier", name: "foo", start: 0, end: 3 };
    tracker.declare("foo", declNode);

    const refNode1 = { type: "Identifier", name: "foo", start: 10, end: 13 };
    const refNode2 = { type: "Identifier", name: "foo", start: 20, end: 23 };

    tracker.reference("foo", refNode1);
    tracker.reference("foo", refNode2);

    const stats = tracker.getScopeStatistics(scope.id);

    assert.ok(stats);
    assert.strictEqual(stats.symbolCount, 1);
    assert.strictEqual(stats.declarationCount, 1);
    assert.strictEqual(stats.referenceCount, 2);
    assert.strictEqual(stats.externalReferenceCount, 0);

    const fooSymbol = stats.symbols[0];
    assert.strictEqual(fooSymbol.name, "foo");
    assert.strictEqual(fooSymbol.hasDeclaration, true);
    assert.strictEqual(fooSymbol.hasReference, true);
    assert.strictEqual(fooSymbol.declarationCount, 1);
    assert.strictEqual(fooSymbol.referenceCount, 2);
});

void test("getScopeStatistics identifies external references", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const declNode = {
        type: "Identifier",
        name: "globalVar",
        start: 0,
        end: 9
    };
    tracker.declare("globalVar", declNode);

    const childScope = tracker.enterScope("function");

    const refNode1 = {
        type: "Identifier",
        name: "globalVar",
        start: 20,
        end: 29
    };
    const refNode2 = {
        type: "Identifier",
        name: "globalVar",
        start: 40,
        end: 49
    };
    const localDeclNode = {
        type: "Identifier",
        name: "localVar",
        start: 30,
        end: 38
    };
    const localRefNode = {
        type: "Identifier",
        name: "localVar",
        start: 50,
        end: 58
    };

    tracker.reference("globalVar", refNode1);
    tracker.reference("globalVar", refNode2);
    tracker.declare("localVar", localDeclNode);
    tracker.reference("localVar", localRefNode);

    const stats = tracker.getScopeStatistics(childScope.id);

    assert.ok(stats);
    assert.strictEqual(stats.symbolCount, 2);
    assert.strictEqual(stats.declarationCount, 1);
    assert.strictEqual(stats.referenceCount, 3);
    assert.strictEqual(stats.externalReferenceCount, 2);

    const globalVarSymbol = stats.symbols.find((s) => s.name === "globalVar");
    assert.ok(globalVarSymbol);
    assert.strictEqual(globalVarSymbol.hasDeclaration, false);
    assert.strictEqual(globalVarSymbol.hasReference, true);
    assert.strictEqual(globalVarSymbol.declarationCount, 0);
    assert.strictEqual(globalVarSymbol.referenceCount, 2);

    const localVarSymbol = stats.symbols.find((s) => s.name === "localVar");
    assert.ok(localVarSymbol);
    assert.strictEqual(localVarSymbol.hasDeclaration, true);
    assert.strictEqual(localVarSymbol.hasReference, true);
    assert.strictEqual(localVarSymbol.declarationCount, 1);
    assert.strictEqual(localVarSymbol.referenceCount, 1);
});

void test("getScopeStatistics calculates scope depth correctly", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const level1Scope = tracker.enterScope("function");
    const level2Scope = tracker.enterScope("block");

    const rootStats = tracker.getScopeStatistics(rootScope.id);
    assert.ok(rootStats);
    assert.strictEqual(rootStats.depth, 0);

    const level1Stats = tracker.getScopeStatistics(level1Scope.id);
    assert.ok(level1Stats);
    assert.strictEqual(level1Stats.depth, 1);

    const level2Stats = tracker.getScopeStatistics(level2Scope.id);
    assert.ok(level2Stats);
    assert.strictEqual(level2Stats.depth, 2);
});

void test("getScopeStatistics handles multiple declarations of same symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    const node1 = { type: "Identifier", name: "foo", start: 0, end: 3 };
    const node2 = { type: "Identifier", name: "foo", start: 10, end: 13 };

    tracker.declare("foo", node1);
    tracker.declare("foo", node2);

    const stats = tracker.getScopeStatistics(scope.id);

    assert.ok(stats);
    assert.strictEqual(stats.symbolCount, 1);
    assert.strictEqual(stats.declarationCount, 2);

    const fooSymbol = stats.symbols[0];
    assert.strictEqual(fooSymbol.name, "foo");
    assert.strictEqual(fooSymbol.declarationCount, 2);
});

void test("getScopeStatistics provides complete symbol breakdown", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("declared", {
        type: "Identifier",
        name: "declared",
        start: 0,
        end: 8
    });
    tracker.reference("referenced", {
        type: "Identifier",
        name: "referenced",
        start: 10,
        end: 20
    });
    tracker.declare("both", {
        type: "Identifier",
        name: "both",
        start: 30,
        end: 34
    });
    tracker.reference("both", {
        type: "Identifier",
        name: "both",
        start: 40,
        end: 44
    });

    const stats = tracker.getScopeStatistics(scope.id);

    assert.ok(stats);
    assert.strictEqual(stats.symbolCount, 3);
    assert.strictEqual(stats.symbols.length, 3);

    const declaredSymbol = stats.symbols.find((s) => s.name === "declared");
    assert.ok(declaredSymbol);
    assert.strictEqual(declaredSymbol.hasDeclaration, true);
    assert.strictEqual(declaredSymbol.hasReference, false);

    const referencedSymbol = stats.symbols.find((s) => s.name === "referenced");
    assert.ok(referencedSymbol);
    assert.strictEqual(referencedSymbol.hasDeclaration, false);
    assert.strictEqual(referencedSymbol.hasReference, true);

    const bothSymbol = stats.symbols.find((s) => s.name === "both");
    assert.ok(bothSymbol);
    assert.strictEqual(bothSymbol.hasDeclaration, true);
    assert.strictEqual(bothSymbol.hasReference, true);
    assert.strictEqual(bothSymbol.declarationCount, 1);
    assert.strictEqual(bothSymbol.referenceCount, 1);
});
