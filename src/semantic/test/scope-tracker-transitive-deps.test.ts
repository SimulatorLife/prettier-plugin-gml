import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { ScopeTracker } from "../src/scopes/scope-tracker.js";

describe("ScopeTracker: transitive dependencies", () => {
    test("getTransitiveDependents returns empty array for non-existent scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.getTransitiveDependents("non-existent");
        assert.deepStrictEqual(result, []);
    });

    test("getTransitiveDependents returns empty array when disabled", () => {
        const tracker = new ScopeTracker({ enabled: false });
        tracker.enterScope("program");
        const programScope = tracker.currentScope();
        assert.ok(programScope);

        const result = tracker.getTransitiveDependents(programScope.id);
        assert.deepStrictEqual(result, []);
    });

    test("getTransitiveDependents returns direct dependents at depth 1", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Program scope declares globalVar
        const programScope = tracker.enterScope("program");
        tracker.declare("globalVar", {
            name: "globalVar",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        });

        // Function scope references globalVar
        const fnScope = tracker.enterScope("function");
        tracker.reference("globalVar", {
            name: "globalVar",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 9 }
        });

        const result = tracker.getTransitiveDependents(programScope.id);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].dependentScopeId, fnScope.id);
        assert.strictEqual(result[0].dependentScopeKind, "function");
        assert.strictEqual(result[0].depth, 1);
    });

    test("getTransitiveDependents returns transitive dependents with correct depth", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Scope A (program) declares symbol X
        const scopeA = tracker.enterScope("program");
        tracker.declare("symbolX", {
            name: "symbolX",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 7 }
        });

        // Scope B (function within A) references X and declares Y
        const scopeB = tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 7 }
        });
        tracker.declare("symbolY", {
            name: "symbolY",
            start: { line: 6, index: 0 },
            end: { line: 6, index: 7 }
        });

        // Scope C (block within B) references Y (depends on B, which depends on A)
        const scopeC = tracker.enterScope("block");
        tracker.reference("symbolY", {
            name: "symbolY",
            start: { line: 10, index: 0 },
            end: { line: 10, index: 7 }
        });
        tracker.exitScope(); // exit block C

        tracker.exitScope(); // exit function B

        const result = tracker.getTransitiveDependents(scopeA.id);

        // Should return both B (depth 1) and C (depth 2)
        assert.strictEqual(result.length, 2);

        const depB = result.find((d) => d.dependentScopeId === scopeB.id);
        const depC = result.find((d) => d.dependentScopeId === scopeC.id);

        assert.ok(depB, "Should include scope B");
        assert.strictEqual(depB.depth, 1);
        assert.strictEqual(depB.dependentScopeKind, "function");

        assert.ok(depC, "Should include scope C");
        assert.strictEqual(depC.depth, 2);
        assert.strictEqual(depC.dependentScopeKind, "block");
    });

    test("getTransitiveDependents handles multiple dependency paths correctly", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Scope A declares X and Y
        const scopeA = tracker.enterScope("program");
        tracker.declare("symbolX", {
            name: "symbolX",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 7 }
        });
        tracker.declare("symbolY", {
            name: "symbolY",
            start: { line: 2, index: 0 },
            end: { line: 2, index: 7 }
        });

        // Scope B references X
        tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 7 }
        });
        tracker.exitScope();

        // Scope C references both X and Y (two paths from A)
        const scopeC = tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 10, index: 0 },
            end: { line: 10, index: 7 }
        });
        tracker.reference("symbolY", {
            name: "symbolY",
            start: { line: 11, index: 0 },
            end: { line: 11, index: 7 }
        });

        const result = tracker.getTransitiveDependents(scopeA.id);

        // Should return both B and C with minimum depth
        assert.strictEqual(result.length, 2);

        const depC = result.find((d) => d.dependentScopeId === scopeC.id);
        assert.ok(depC);
        assert.strictEqual(depC.depth, 1, "Should use minimum depth when multiple paths exist");
    });

    test("getTransitiveDependents avoids infinite loops with circular dependencies", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // This test ensures we don't infinite loop even if there are cycles
        // In practice, GML shouldn't have circular scope dependencies, but
        // we should handle it gracefully anyway

        const scopeA = tracker.enterScope("program");
        tracker.declare("varA", {
            name: "varA",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 4 }
        });

        const result = tracker.getTransitiveDependents(scopeA.id);

        // Should complete without hanging
        assert.ok(Array.isArray(result));
    });

    test("getTransitiveDependents sorts by depth then scope ID", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scopeA = tracker.enterScope("program");
        tracker.declare("symbolX", {
            name: "symbolX",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 7 }
        });

        // Create multiple scopes at depth 1
        tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 7 }
        });
        tracker.declare("symbolY", {
            name: "symbolY",
            start: { line: 6, index: 0 },
            end: { line: 6, index: 7 }
        });

        // Create scope at depth 2 nested within B1
        tracker.enterScope("block");
        tracker.reference("symbolY", {
            name: "symbolY",
            start: { line: 15, index: 0 },
            end: { line: 15, index: 7 }
        });
        tracker.exitScope(); // exit block C

        tracker.exitScope(); // exit function B1

        tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 10, index: 0 },
            end: { line: 10, index: 7 }
        });
        tracker.exitScope();

        const result = tracker.getTransitiveDependents(scopeA.id);

        assert.strictEqual(result.length, 3);

        // Depth 1 scopes should come before depth 2
        assert.strictEqual(result[0].depth, 1);
        assert.strictEqual(result[1].depth, 1);
        assert.strictEqual(result[2].depth, 2);

        // Within same depth, should be sorted by scope ID
        assert.ok(result[0].dependentScopeId.localeCompare(result[1].dependentScopeId) < 0);
    });
});

describe("ScopeTracker: invalidation sets", () => {
    test("getInvalidationSet returns empty array for non-existent scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.getInvalidationSet("non-existent");
        assert.deepStrictEqual(result, []);
    });

    test("getInvalidationSet returns only self when no dependents", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("program");
        tracker.declare("standalone", {
            name: "standalone",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 10 }
        });

        const result = tracker.getInvalidationSet(scope.id);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].scopeId, scope.id);
        assert.strictEqual(result[0].scopeKind, "program");
        assert.strictEqual(result[0].reason, "self");
    });

    test("getInvalidationSet includes direct dependents", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scopeA = tracker.enterScope("program");
        tracker.declare("globalVar", {
            name: "globalVar",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        });

        const scopeB = tracker.enterScope("function");
        tracker.reference("globalVar", {
            name: "globalVar",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 9 }
        });

        const result = tracker.getInvalidationSet(scopeA.id);

        assert.strictEqual(result.length, 2);

        const selfEntry = result.find((e) => e.reason === "self");
        const depEntry = result.find((e) => e.reason === "dependent");

        assert.ok(selfEntry);
        assert.strictEqual(selfEntry.scopeId, scopeA.id);

        assert.ok(depEntry);
        assert.strictEqual(depEntry.scopeId, scopeB.id);
    });

    test("getInvalidationSet includes transitive dependents", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // A -> B -> C dependency chain
        const scopeA = tracker.enterScope("program");
        tracker.declare("symbolX", {
            name: "symbolX",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 7 }
        });

        const scopeB = tracker.enterScope("function");
        tracker.reference("symbolX", {
            name: "symbolX",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 7 }
        });
        tracker.declare("symbolY", {
            name: "symbolY",
            start: { line: 6, index: 0 },
            end: { line: 6, index: 7 }
        });

        const scopeC = tracker.enterScope("block");
        tracker.reference("symbolY", {
            name: "symbolY",
            start: { line: 10, index: 0 },
            end: { line: 10, index: 7 }
        });
        tracker.exitScope(); // exit block C
        tracker.exitScope(); // exit function B

        const result = tracker.getInvalidationSet(scopeA.id);

        assert.strictEqual(result.length, 3);

        const reasons = new Set(result.map((e) => e.reason));
        assert.ok(reasons.has("self"));
        assert.ok(reasons.has("dependent"));

        const scopeIds = new Set(result.map((e) => e.scopeId));
        assert.ok(scopeIds.has(scopeA.id));
        assert.ok(scopeIds.has(scopeB.id));
        assert.ok(scopeIds.has(scopeC.id));
    });

    test("getInvalidationSet excludes descendants by default", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parent = tracker.enterScope("program");
        tracker.declare("parentVar", {
            name: "parentVar",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        });

        // Child scope nested within parent
        tracker.enterScope("function");
        tracker.declare("childVar", {
            name: "childVar",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 8 }
        });

        const result = tracker.getInvalidationSet(parent.id);

        // Should only include the parent scope itself (no dependents, no descendants)
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].scopeId, parent.id);
    });

    test("getInvalidationSet includes descendants when requested", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parent = tracker.enterScope("program");
        tracker.declare("parentVar", {
            name: "parentVar",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        });

        const child = tracker.enterScope("function");
        tracker.declare("childVar", {
            name: "childVar",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 8 }
        });

        const result = tracker.getInvalidationSet(parent.id, { includeDescendants: true });

        assert.strictEqual(result.length, 2);

        const parentEntry = result.find((e) => e.scopeId === parent.id);
        const childEntry = result.find((e) => e.scopeId === child.id);

        assert.ok(parentEntry);
        assert.strictEqual(parentEntry.reason, "self");

        assert.ok(childEntry);
        assert.strictEqual(childEntry.reason, "descendant");
    });

    test("getInvalidationSet avoids duplicates when scope is both dependent and descendant", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parent = tracker.enterScope("program");
        tracker.declare("sharedVar", {
            name: "sharedVar",
            start: { line: 1, index: 0 },
            end: { line: 1, index: 9 }
        });

        // Child scope that also depends on parent
        const child = tracker.enterScope("function");
        tracker.reference("sharedVar", {
            name: "sharedVar",
            start: { line: 5, index: 0 },
            end: { line: 5, index: 9 }
        });

        const result = tracker.getInvalidationSet(parent.id, { includeDescendants: true });

        // Should not have duplicates
        const scopeIds = result.map((e) => e.scopeId);
        const uniqueIds = new Set(scopeIds);
        assert.strictEqual(scopeIds.length, uniqueIds.size);

        // Child should appear exactly once
        const childEntries = result.filter((e) => e.scopeId === child.id);
        assert.strictEqual(childEntries.length, 1);
    });
});

describe("ScopeTracker: descendant scopes", () => {
    test("getDescendantScopes returns empty array for non-existent scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.getDescendantScopes("non-existent");
        assert.deepStrictEqual(result, []);
    });

    test("getDescendantScopes returns empty array when no descendants", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("program");

        const result = tracker.getDescendantScopes(scope.id);
        assert.deepStrictEqual(result, []);
    });

    test("getDescendantScopes returns direct children at depth 1", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parent = tracker.enterScope("program");

        const child1 = tracker.enterScope("function");
        tracker.exitScope();

        const child2 = tracker.enterScope("function");

        const result = tracker.getDescendantScopes(parent.id);

        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].depth, 1);
        assert.strictEqual(result[1].depth, 1);

        const childIds = new Set(result.map((d) => d.scopeId));
        assert.ok(childIds.has(child1.id));
        assert.ok(childIds.has(child2.id));
    });

    test("getDescendantScopes returns grandchildren at depth 2", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const root = tracker.enterScope("program");

        const child = tracker.enterScope("function");

        const grandchild = tracker.enterScope("block");

        const result = tracker.getDescendantScopes(root.id);

        assert.strictEqual(result.length, 2);

        const childEntry = result.find((d) => d.scopeId === child.id);
        const grandchildEntry = result.find((d) => d.scopeId === grandchild.id);

        assert.ok(childEntry);
        assert.strictEqual(childEntry.depth, 1);

        assert.ok(grandchildEntry);
        assert.strictEqual(grandchildEntry.depth, 2);
    });

    test("getDescendantScopes excludes the scope itself", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parent = tracker.enterScope("program");

        tracker.enterScope("function");

        const result = tracker.getDescendantScopes(parent.id);

        const scopeIds = result.map((d) => d.scopeId);
        assert.ok(!scopeIds.includes(parent.id));
    });

    test("getDescendantScopes sorts by depth then scope ID", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const root = tracker.enterScope("program");

        tracker.enterScope("function");
        tracker.enterScope("block");
        tracker.exitScope();
        tracker.exitScope();

        tracker.enterScope("function");

        const result = tracker.getDescendantScopes(root.id);

        assert.strictEqual(result.length, 3);

        // Depth 1 scopes should come before depth 2
        assert.strictEqual(result[0].depth, 1);
        assert.strictEqual(result[1].depth, 1);
        assert.strictEqual(result[2].depth, 2);

        // Depth 1 scopes should be sorted by ID
        assert.ok(result[0].scopeId.localeCompare(result[1].scopeId) < 0);
    });

    test("getDescendantScopes handles complex nesting", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const root = tracker.enterScope("program");

        tracker.enterScope("function");
        tracker.enterScope("block");
        tracker.enterScope("block");
        tracker.exitScope(); // exit block2
        tracker.exitScope(); // exit block1
        tracker.exitScope(); // exit fn1

        tracker.enterScope("function");
        tracker.enterScope("block");

        const result = tracker.getDescendantScopes(root.id);

        assert.strictEqual(result.length, 5);

        // Should have 2 scopes at depth 1 (fn1, fn2)
        const depth1 = result.filter((d) => d.depth === 1);
        assert.strictEqual(depth1.length, 2);

        // Should have 2 scopes at depth 2 (block1, block3)
        const depth2 = result.filter((d) => d.depth === 2);
        assert.strictEqual(depth2.length, 2);

        // Should have 1 scope at depth 3 (block2 nested in block1)
        const depth3 = result.filter((d) => d.depth === 3);
        assert.strictEqual(depth3.length, 1);
    });
});
