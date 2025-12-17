import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("getAllSymbolsSummary returns empty array for empty tracker", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const summary = tracker.getAllSymbolsSummary();

    assert.deepStrictEqual(summary, []);
});

void test("getAllSymbolsSummary aggregates single symbol across multiple scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "myVar",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 5 } },
        { kind: "variable" }
    );

    tracker.enterScope("function");
    tracker.reference(
        "myVar",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 5 } },
        { kind: "variable" }
    );

    tracker.enterScope("block");
    tracker.reference(
        "myVar",
        { start: { line: 5, index: 0 }, end: { line: 5, index: 5 } },
        { kind: "variable" }
    );
    tracker.exitScope();
    tracker.exitScope();
    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 1);
    assert.strictEqual(summary[0].name, "myVar");
    assert.strictEqual(summary[0].scopeCount, 3);
    assert.strictEqual(summary[0].declarationCount, 1);
    assert.strictEqual(summary[0].referenceCount, 2);
    assert.strictEqual(summary[0].scopes.length, 3);
});

void test("getAllSymbolsSummary handles multiple symbols with different patterns", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "globalVar",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } },
        { kind: "variable", tags: ["global"] }
    );

    tracker.enterScope("function");
    tracker.declare(
        "localVar",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 8 } },
        { kind: "variable", tags: ["local"] }
    );
    tracker.reference(
        "globalVar",
        { start: { line: 4, index: 0 }, end: { line: 4, index: 9 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    tracker.enterScope("function");
    tracker.declare(
        "anotherLocal",
        { start: { line: 7, index: 0 }, end: { line: 7, index: 12 } },
        { kind: "variable" }
    );
    tracker.reference(
        "globalVar",
        { start: { line: 8, index: 0 }, end: { line: 8, index: 9 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 3);

    const globalVarSummary = summary.find((s) => s.name === "globalVar");
    assert.ok(globalVarSummary);
    assert.strictEqual(globalVarSummary.scopeCount, 3);
    assert.strictEqual(globalVarSummary.declarationCount, 1);
    assert.strictEqual(globalVarSummary.referenceCount, 2);

    const localVarSummary = summary.find((s) => s.name === "localVar");
    assert.ok(localVarSummary);
    assert.strictEqual(localVarSummary.scopeCount, 1);
    assert.strictEqual(localVarSummary.declarationCount, 1);
    assert.strictEqual(localVarSummary.referenceCount, 0);

    const anotherLocalSummary = summary.find((s) => s.name === "anotherLocal");
    assert.ok(anotherLocalSummary);
    assert.strictEqual(anotherLocalSummary.scopeCount, 1);
    assert.strictEqual(anotherLocalSummary.declarationCount, 1);
    assert.strictEqual(anotherLocalSummary.referenceCount, 0);
});

void test("getAllSymbolsSummary correctly reports hasDeclaration and hasReference flags", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const programScope = tracker.enterScope("program");
    tracker.declare(
        "shared",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } },
        { kind: "variable" }
    );

    const func1Scope = tracker.enterScope("function");
    tracker.reference(
        "shared",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 6 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    const func2Scope = tracker.enterScope("function");
    tracker.declare(
        "shared",
        { start: { line: 6, index: 0 }, end: { line: 6, index: 6 } },
        { kind: "variable" }
    );
    tracker.reference(
        "shared",
        { start: { line: 7, index: 0 }, end: { line: 7, index: 6 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 1);
    const sharedSummary = summary[0];

    assert.strictEqual(sharedSummary.name, "shared");
    assert.strictEqual(sharedSummary.scopeCount, 3);
    assert.strictEqual(sharedSummary.declarationCount, 2);
    assert.strictEqual(sharedSummary.referenceCount, 2);

    const programScopeSummary = sharedSummary.scopes.find(
        (s) => s.scopeId === programScope.id
    );
    assert.ok(programScopeSummary);
    assert.strictEqual(programScopeSummary.hasDeclaration, true);
    assert.strictEqual(programScopeSummary.hasReference, false);

    const func1ScopeSummary = sharedSummary.scopes.find(
        (s) => s.scopeId === func1Scope.id
    );
    assert.ok(func1ScopeSummary);
    assert.strictEqual(func1ScopeSummary.hasDeclaration, false);
    assert.strictEqual(func1ScopeSummary.hasReference, true);

    const func2ScopeSummary = sharedSummary.scopes.find(
        (s) => s.scopeId === func2Scope.id
    );
    assert.ok(func2ScopeSummary);
    assert.strictEqual(func2ScopeSummary.hasDeclaration, true);
    assert.strictEqual(func2ScopeSummary.hasReference, true);
});

void test("getAllSymbolsSummary includes scopeKind in scope details", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "test",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } },
        { kind: "variable" }
    );

    tracker.enterScope("function");
    tracker.reference(
        "test",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 4 } },
        { kind: "variable" }
    );

    tracker.enterScope("block");
    tracker.reference(
        "test",
        { start: { line: 5, index: 0 }, end: { line: 5, index: 4 } },
        { kind: "variable" }
    );
    tracker.exitScope();
    tracker.exitScope();
    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 1);
    const testSummary = summary[0];

    assert.strictEqual(testSummary.scopes.length, 3);
    assert.ok(testSummary.scopes.some((s) => s.scopeKind === "program"));
    assert.ok(testSummary.scopes.some((s) => s.scopeKind === "function"));
    assert.ok(testSummary.scopes.some((s) => s.scopeKind === "block"));
});

void test("getAllSymbolsSummary handles symbols with only declarations", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "unused",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 1);
    assert.strictEqual(summary[0].name, "unused");
    assert.strictEqual(summary[0].declarationCount, 1);
    assert.strictEqual(summary[0].referenceCount, 0);
    assert.strictEqual(summary[0].scopeCount, 1);
});

void test("getAllSymbolsSummary handles symbols with only references (undeclared)", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.reference(
        "undeclared",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 10 } },
        { kind: "variable" }
    );
    tracker.reference(
        "undeclared",
        { start: { line: 2, index: 0 }, end: { line: 2, index: 10 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 1);
    assert.strictEqual(summary[0].name, "undeclared");
    assert.strictEqual(summary[0].declarationCount, 0);
    assert.strictEqual(summary[0].referenceCount, 2);
    assert.strictEqual(summary[0].scopeCount, 1);
});

void test("getAllSymbolsSummary returns empty array when tracker is disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    tracker.enterScope("program");
    tracker.declare("var1", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 4 }
    });
    tracker.reference("var1", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 4 }
    });
    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.deepStrictEqual(summary, []);
});

void test("getAllSymbolsSummary supports hot reload coordination use case", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare(
        "GameState",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } },
        { kind: "variable", tags: ["global"] }
    );

    tracker.enterScope("function");
    tracker.declare(
        "player",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 6 } },
        { kind: "variable", tags: ["parameter"] }
    );
    tracker.reference(
        "GameState",
        { start: { line: 4, index: 0 }, end: { line: 4, index: 9 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    tracker.enterScope("function");
    tracker.declare(
        "enemy",
        { start: { line: 7, index: 0 }, end: { line: 7, index: 5 } },
        { kind: "variable" }
    );
    tracker.reference(
        "GameState",
        { start: { line: 8, index: 0 }, end: { line: 8, index: 9 } },
        { kind: "variable" }
    );
    tracker.reference(
        "player",
        { start: { line: 9, index: 0 }, end: { line: 9, index: 6 } },
        { kind: "variable" }
    );
    tracker.exitScope();

    tracker.exitScope();

    const summary = tracker.getAllSymbolsSummary();

    assert.strictEqual(summary.length, 3);

    const gameStateSummary = summary.find((s) => s.name === "GameState");
    assert.ok(gameStateSummary);
    assert.strictEqual(gameStateSummary.scopeCount, 3);
    assert.ok(
        gameStateSummary.declarationCount >= 1,
        "GameState should have at least 1 declaration"
    );
    assert.ok(
        gameStateSummary.referenceCount >= 2,
        "GameState should have at least 2 references"
    );

    const playerSummary = summary.find((s) => s.name === "player");
    assert.ok(playerSummary);
    assert.strictEqual(playerSummary.scopeCount, 2);

    const enemySummary = summary.find((s) => s.name === "enemy");
    assert.ok(enemySummary);
    assert.strictEqual(enemySummary.scopeCount, 1);
});
