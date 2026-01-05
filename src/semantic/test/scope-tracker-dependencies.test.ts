import test from "node:test";
import assert from "node:assert/strict";
import ScopeTracker from "../src/scopes/scope-tracker.js";

void test("getScopeDependencies returns empty array for scope with no external references", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("localVar", {
        name: "localVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 8, index: 8 }
    });

    const dependencies = tracker.getScopeDependencies(scope.id);

    assert.deepStrictEqual(dependencies, []);
});

void test("getScopeDependencies identifies dependencies from external references", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Program scope declares global symbols
    const programScope = tracker.enterScope("program");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });
    tracker.declare("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 2, column: 0, index: 10 },
        end: { line: 2, column: 13, index: 23 }
    });

    // Function scope references global symbols
    const functionScope = tracker.enterScope("function");
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 5, column: 4, index: 50 },
        end: { line: 5, column: 13, index: 59 }
    });
    tracker.reference("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 6, column: 4, index: 64 },
        end: { line: 6, column: 17, index: 77 }
    });

    const dependencies = tracker.getScopeDependencies(functionScope.id);

    assert.strictEqual(dependencies.length, 1);
    assert.strictEqual(dependencies[0].dependencyScopeId, programScope.id);
    assert.strictEqual(dependencies[0].dependencyScopeKind, "program");
    assert.deepStrictEqual(dependencies[0].symbols, ["anotherGlobal", "globalVar"]);
});

void test("getScopeDependencies handles multiple dependency scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Program scope
    const programScope = tracker.enterScope("program");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });
    tracker.declare("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 2, column: 0, index: 10 },
        end: { line: 2, column: 13, index: 23 }
    });

    // Function scope - nested block references both globals
    tracker.enterScope("function");

    const blockScope = tracker.enterScope("block");
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 8, column: 4, index: 80 },
        end: { line: 8, column: 13, index: 89 }
    });
    tracker.reference("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 9, column: 4, index: 94 },
        end: { line: 9, column: 17, index: 107 }
    });

    const dependencies = tracker.getScopeDependencies(blockScope.id);

    assert.strictEqual(dependencies.length, 1);
    assert.strictEqual(dependencies[0].dependencyScopeId, programScope.id);
    assert.strictEqual(dependencies[0].dependencyScopeKind, "program");
    assert.deepStrictEqual(dependencies[0].symbols, ["anotherGlobal", "globalVar"]);
});

void test("getScopeDependencies returns empty array for unknown scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const dependencies = tracker.getScopeDependencies("unknown-scope");

    assert.deepStrictEqual(dependencies, []);
});

void test("getScopeDependencies returns empty array for null scope", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const dependencies = tracker.getScopeDependencies(null);

    assert.deepStrictEqual(dependencies, []);
});

void test("getScopeDependents returns empty array for scope with no dependents", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");

    tracker.declare("localVar", {
        name: "localVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 8, index: 8 }
    });

    const dependents = tracker.getScopeDependents(scope.id);

    assert.deepStrictEqual(dependents, []);
});

void test("getScopeDependents identifies scopes that depend on the queried scope", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Program scope declares symbols
    const programScope = tracker.enterScope("program");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });

    // Function scope references global symbols
    const functionScope = tracker.enterScope("function");
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 5, column: 4, index: 50 },
        end: { line: 5, column: 13, index: 59 }
    });

    const dependents = tracker.getScopeDependents(programScope.id);

    assert.strictEqual(dependents.length, 1);
    assert.strictEqual(dependents[0].dependentScopeId, functionScope.id);
    assert.strictEqual(dependents[0].dependentScopeKind, "function");
    assert.deepStrictEqual(dependents[0].symbols, ["globalVar"]);
});

void test("getScopeDependents handles multiple dependent scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Program scope declares symbols
    const programScope = tracker.enterScope("program");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });
    tracker.declare("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 2, column: 0, index: 10 },
        end: { line: 2, column: 13, index: 23 }
    });

    // First function references globalVar
    const function1Scope = tracker.enterScope("function");
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 5, column: 4, index: 50 },
        end: { line: 5, column: 13, index: 59 }
    });
    tracker.exitScope();

    // Second function references both globals
    const function2Scope = tracker.enterScope("function");
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 8, column: 4, index: 80 },
        end: { line: 8, column: 13, index: 89 }
    });
    tracker.reference("anotherGlobal", {
        name: "anotherGlobal",
        start: { line: 9, column: 4, index: 94 },
        end: { line: 9, column: 17, index: 107 }
    });

    const dependents = tracker.getScopeDependents(programScope.id);

    assert.strictEqual(dependents.length, 2);

    // Dependents should be sorted by scope ID
    const sortedDeps = [...dependents].sort((a, b) => a.dependentScopeId.localeCompare(b.dependentScopeId));

    assert.strictEqual(sortedDeps[0].dependentScopeId, function1Scope.id);
    assert.deepStrictEqual(sortedDeps[0].symbols, ["globalVar"]);

    assert.strictEqual(sortedDeps[1].dependentScopeId, function2Scope.id);
    assert.deepStrictEqual(sortedDeps[1].symbols, ["anotherGlobal", "globalVar"]);
});

void test("getScopeDependents excludes scopes that declare symbols locally", () => {
    const tracker = new ScopeTracker({ enabled: true });

    // Program scope declares globalVar
    const programScope = tracker.enterScope("program");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 9, index: 9 }
    });

    // Function scope declares its own globalVar (shadowing)
    tracker.enterScope("function");
    tracker.declare("globalVar", {
        name: "globalVar",
        start: { line: 5, column: 4, index: 50 },
        end: { line: 5, column: 13, index: 59 }
    });
    tracker.reference("globalVar", {
        name: "globalVar",
        start: { line: 6, column: 4, index: 64 },
        end: { line: 6, column: 13, index: 73 }
    });

    const dependents = tracker.getScopeDependents(programScope.id);

    // Function scope should NOT be a dependent because it declares globalVar locally
    assert.deepStrictEqual(dependents, []);
});

void test("getScopeDependents returns empty array for unknown scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const dependents = tracker.getScopeDependents("unknown-scope");

    assert.deepStrictEqual(dependents, []);
});

void test("getScopeDependents returns empty array for null scope", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const dependents = tracker.getScopeDependents(null);

    assert.deepStrictEqual(dependents, []);
});

void test("getScopeDependents excludes the scope itself", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const programScope = tracker.enterScope("program");
    tracker.declare("recursiveVar", {
        name: "recursiveVar",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 12, index: 12 }
    });

    // Reference the same variable in the same scope
    tracker.reference("recursiveVar", {
        name: "recursiveVar",
        start: { line: 2, column: 0, index: 13 },
        end: { line: 2, column: 12, index: 25 }
    });

    const dependents = tracker.getScopeDependents(programScope.id);

    // The scope itself should not be listed as a dependent
    assert.deepStrictEqual(dependents, []);
});

void test("dependency graph: comprehensive integration test", () => {
    const tracker = new ScopeTracker({ enabled: true });

    /*
     * Build a dependency graph:
     *   program (declares: config, state)
     *     └─ function1 (declares: localA, references: config)
     *         └─ function2 (declares: localB, references: state, localA)
     *             └─ block (references: state, localB)
     */

    const programScope = tracker.enterScope("program");
    tracker.declare("config", {
        name: "config",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 6, index: 6 }
    });
    tracker.declare("state", {
        name: "state",
        start: { line: 2, column: 0, index: 7 },
        end: { line: 2, column: 5, index: 12 }
    });

    const function1Scope = tracker.enterScope("function");
    tracker.declare("localA", {
        name: "localA",
        start: { line: 5, column: 4, index: 30 },
        end: { line: 5, column: 10, index: 36 }
    });
    tracker.reference("config", {
        name: "config",
        start: { line: 6, column: 4, index: 41 },
        end: { line: 6, column: 10, index: 47 }
    });

    const function2Scope = tracker.enterScope("function");
    tracker.declare("localB", {
        name: "localB",
        start: { line: 10, column: 4, index: 70 },
        end: { line: 10, column: 10, index: 76 }
    });
    tracker.reference("state", {
        name: "state",
        start: { line: 11, column: 4, index: 81 },
        end: { line: 11, column: 9, index: 86 }
    });
    tracker.reference("localA", {
        name: "localA",
        start: { line: 12, column: 4, index: 91 },
        end: { line: 12, column: 10, index: 97 }
    });

    const blockScope = tracker.enterScope("block");
    tracker.reference("state", {
        name: "state",
        start: { line: 15, column: 8, index: 120 },
        end: { line: 15, column: 13, index: 125 }
    });
    tracker.reference("localB", {
        name: "localB",
        start: { line: 16, column: 8, index: 134 },
        end: { line: 16, column: 14, index: 140 }
    });
    tracker.exitScope(); // block
    tracker.exitScope(); // function2
    tracker.exitScope(); // function1

    // Test getScopeDependencies for function2
    const function2Deps = tracker.getScopeDependencies(function2Scope.id);
    assert.strictEqual(function2Deps.length, 2);

    const function2DepsMap = new Map(function2Deps.map((dep) => [dep.dependencyScopeId, dep]));
    assert.ok(function2DepsMap.has(programScope.id));
    assert.ok(function2DepsMap.has(function1Scope.id));
    assert.deepStrictEqual(function2DepsMap.get(programScope.id)?.symbols, ["state"]);
    assert.deepStrictEqual(function2DepsMap.get(function1Scope.id)?.symbols, ["localA"]);

    // Test getScopeDependents for programScope
    const programDependents = tracker.getScopeDependents(programScope.id);
    assert.strictEqual(programDependents.length, 3);

    const programDependentsMap = new Map(programDependents.map((dep) => [dep.dependentScopeId, dep]));
    assert.ok(programDependentsMap.has(function1Scope.id));
    assert.ok(programDependentsMap.has(function2Scope.id));
    assert.ok(programDependentsMap.has(blockScope.id));
    assert.deepStrictEqual(programDependentsMap.get(function1Scope.id)?.symbols, ["config"]);
    assert.deepStrictEqual(programDependentsMap.get(function2Scope.id)?.symbols, ["state"]);
    assert.deepStrictEqual(programDependentsMap.get(blockScope.id)?.symbols, ["state"]);

    // Test getScopeDependents for function2Scope
    const function2Dependents = tracker.getScopeDependents(function2Scope.id);
    assert.strictEqual(function2Dependents.length, 1);
    assert.strictEqual(function2Dependents[0].dependentScopeId, blockScope.id);
    assert.deepStrictEqual(function2Dependents[0].symbols, ["localB"]);
});
