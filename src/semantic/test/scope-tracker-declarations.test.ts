import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scopes/scope-tracker.js";
import { setupNestedScopes } from "./scope-tracker-helpers.js";

void test("getAllDeclarations returns empty array for empty tracker", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const declarations = tracker.getAllDeclarations();

    assert.deepStrictEqual(declarations, []);
});

void test("getAllDeclarations returns all symbols across multiple scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("globalVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 9 }
    });

    tracker.enterScope("function");
    tracker.declare("param1", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 6 }
    });
    tracker.declare("localVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    tracker.enterScope("block");
    tracker.declare("blockVar", {
        start: { line: 4, index: 0 },
        end: { line: 4, index: 8 }
    });

    const declarations = tracker.getAllDeclarations();

    assert.strictEqual(declarations.length, 4);
    assert.ok(declarations.some((d) => d.name === "globalVar"));
    assert.ok(declarations.some((d) => d.name === "param1"));
    assert.ok(declarations.some((d) => d.name === "localVar"));
    assert.ok(declarations.some((d) => d.name === "blockVar"));
});

void test("getAllDeclarations includes scope context", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const { programScope, functionScope } = setupNestedScopes(tracker);

    const declarations = tracker.getAllDeclarations();

    const globalDecl = declarations.find((d) => d.name === "globalVar");
    assert.ok(globalDecl);
    assert.strictEqual(globalDecl.scopeId, programScope?.id);
    assert.strictEqual(globalDecl.scopeKind, "program");

    const localDecl = declarations.find((d) => d.name === "localVar");
    assert.ok(localDecl);
    assert.strictEqual(localDecl.scopeId, functionScope?.id);
    assert.strictEqual(localDecl.scopeKind, "function");
});

void test("getAllDeclarations returns cloned metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("testVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 7 }
    });

    const declarations = tracker.getAllDeclarations();
    const decl = declarations.find((d) => d.name === "testVar");

    assert.ok(decl?.metadata);
    assert.ok(decl.metadata.start);
    assert.strictEqual(decl.metadata.start.line, 1);
    assert.strictEqual(decl.metadata.start.index, 0);

    decl.metadata.start.line = 999;

    const declarations2 = tracker.getAllDeclarations();
    const decl2 = declarations2.find((d) => d.name === "testVar");

    assert.strictEqual(decl2?.metadata?.start?.line, 1);
});

void test("getAllDeclarations is sorted by scope ID then name", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("zVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 4 }
    });
    tracker.declare("aVar", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 4 }
    });

    tracker.enterScope("function");
    tracker.declare("mVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 4 }
    });
    tracker.declare("bVar", {
        start: { line: 4, index: 0 },
        end: { line: 4, index: 4 }
    });

    const declarations = tracker.getAllDeclarations();

    assert.strictEqual(declarations.length, 4);

    for (let i = 1; i < declarations.length; i += 1) {
        const prev = declarations[i - 1];
        const curr = declarations[i];

        const scopeCmp = prev.scopeId.localeCompare(curr.scopeId);
        if (scopeCmp === 0) {
            assert.ok(
                prev.name.localeCompare(curr.name) <= 0,
                `Expected ${prev.name} <= ${curr.name}`
            );
        }
    }
});

void test("getAllDeclarations supports project-wide symbol analysis", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("GameState", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 9 }
    });
    tracker.declare("PlayerController", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 16 }
    });

    tracker.enterScope("function");
    tracker.declare("update", {
        start: { line: 10, index: 0 },
        end: { line: 10, index: 6 }
    });
    tracker.enterScope("block");
    tracker.declare("deltaTime", {
        start: { line: 11, index: 0 },
        end: { line: 11, index: 9 }
    });

    const declarations = tracker.getAllDeclarations();

    const symbolTable = new Map();
    for (const decl of declarations) {
        symbolTable.set(decl.name, {
            scopeId: decl.scopeId,
            scopeKind: decl.scopeKind,
            location: decl.metadata
        });
    }

    assert.ok(symbolTable.has("GameState"));
    assert.ok(symbolTable.has("PlayerController"));
    assert.ok(symbolTable.has("update"));
    assert.ok(symbolTable.has("deltaTime"));
});

void test("getDeclarationInScope returns metadata for declared symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    const programScope = tracker.currentScope();
    tracker.declare("testVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 7 }
    });

    const metadata = tracker.getDeclarationInScope("testVar", programScope?.id);

    assert.ok(metadata);
    assert.strictEqual(metadata.name, "testVar");
    assert.strictEqual(metadata.scopeId, programScope?.id);
});

void test("getDeclarationInScope returns null for undeclared symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    const programScope = tracker.currentScope();

    const metadata = tracker.getDeclarationInScope(
        "unknownVar",
        programScope?.id
    );

    assert.strictEqual(metadata, null);
});

void test("getDeclarationInScope returns null for invalid scope", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const metadata = tracker.getDeclarationInScope("testVar", "invalid-scope");

    assert.strictEqual(metadata, null);
});

void test("getDeclarationInScope returns null for null inputs", () => {
    const tracker = new ScopeTracker({ enabled: true });

    assert.strictEqual(tracker.getDeclarationInScope(null, "scope-0"), null);
    assert.strictEqual(tracker.getDeclarationInScope("name", null), null);
    assert.strictEqual(tracker.getDeclarationInScope(null, null), null);
});

void test("getDeclarationInScope returns cloned metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    const programScope = tracker.currentScope();
    tracker.declare("testVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 7 }
    });

    const metadata1 = tracker.getDeclarationInScope(
        "testVar",
        programScope?.id
    );
    assert.ok(metadata1?.start);
    metadata1.start.line = 999;

    const metadata2 = tracker.getDeclarationInScope(
        "testVar",
        programScope?.id
    );

    assert.strictEqual(metadata2?.start?.line, 1);
});

void test("getDeclarationInScope only returns declarations in the specified scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const { programScope, functionScope } = setupNestedScopes(tracker);

    const globalInProgram = tracker.getDeclarationInScope(
        "globalVar",
        programScope?.id
    );
    assert.ok(globalInProgram);

    const globalInFunction = tracker.getDeclarationInScope(
        "globalVar",
        functionScope?.id
    );
    assert.strictEqual(globalInFunction, null);

    const localInFunction = tracker.getDeclarationInScope(
        "localVar",
        functionScope?.id
    );
    assert.ok(localInFunction);

    const localInProgram = tracker.getDeclarationInScope(
        "localVar",
        programScope?.id
    );
    assert.strictEqual(localInProgram, null);
});

void test("getAllDeclarations and getDeclarationInScope work together for efficient lookup", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("program");
    tracker.declare("GameState", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 9 }
    });

    tracker.enterScope("function");
    tracker.declare("update", {
        start: { line: 10, index: 0 },
        end: { line: 10, index: 6 }
    });

    const allDeclarations = tracker.getAllDeclarations();

    for (const decl of allDeclarations) {
        const metadata = tracker.getDeclarationInScope(decl.name, decl.scopeId);
        assert.ok(metadata);
        assert.strictEqual(metadata.name, decl.name);
        assert.strictEqual(metadata.scopeId, decl.scopeId);
    }
});
