import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

/**
 * Tests for ScopeTracker.resolveIdentifierScopeId — the lean resolution path
 * used by collectScopeDependents to avoid metadata cloning in the hot-reload
 * invalidation critical path.
 */
void describe("ScopeTracker.resolveIdentifierScopeId", () => {
    void it("returns the declaring scope ID for a locally declared symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const rootScope = tracker.enterScope("program");
        tracker.declare("myVar", { name: "myVar" });

        const result = tracker.resolveIdentifierScopeId("myVar");

        assert.strictEqual(result, rootScope.id);
    });

    void it("returns the outer scope ID when symbol is declared in a parent scope", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const parentScope = tracker.enterScope("program");
        tracker.declare("outerVar", { name: "outerVar" });

        tracker.enterScope("function");

        const result = tracker.resolveIdentifierScopeId("outerVar");

        assert.strictEqual(result, parentScope.id, "Should resolve to the parent scope");
    });

    void it("returns the shadowing scope ID when inner scope redeclares a symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("program");
        tracker.declare("value", { name: "value" });

        const innerScope = tracker.enterScope("function");
        tracker.declare("value", { name: "value" });

        const result = tracker.resolveIdentifierScopeId("value");

        assert.strictEqual(result, innerScope.id, "Should resolve to the inner (shadowing) scope");
    });

    void it("returns null for an undeclared symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("program");

        const result = tracker.resolveIdentifierScopeId("nonexistent");

        assert.strictEqual(result, null);
    });

    void it("returns null for null/undefined name", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program");

        assert.strictEqual(tracker.resolveIdentifierScopeId(null), null);
        assert.strictEqual(tracker.resolveIdentifierScopeId(undefined), null);
        assert.strictEqual(tracker.resolveIdentifierScopeId(""), null);
    });

    void it("resolves from a specific scope ID passed as argument (post-parse path)", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const programScope = tracker.enterScope("program");
        tracker.declare("globalSym", { name: "globalSym" });

        const fnScope = tracker.enterScope("function");
        const blockScope = tracker.enterScope("block");

        tracker.exitScope(); // exit block
        tracker.exitScope(); // exit function
        tracker.exitScope(); // exit program

        // After parsing, resolve from a specific scope up the parent chain
        const result = tracker.resolveIdentifierScopeId("globalSym", blockScope.id);

        assert.strictEqual(result, programScope.id, "Should resolve via parent chain after stack is unwound");
        assert.strictEqual(
            tracker.resolveIdentifierScopeId("globalSym", fnScope.id),
            programScope.id,
            "Should resolve the same way from the function scope"
        );
    });

    void it("agrees with resolveIdentifier on the returned scope ID", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const programScope = tracker.enterScope("program");
        tracker.declare("shared", { name: "shared" });

        tracker.enterScope("function");
        tracker.declare("local", { name: "local" });

        const sharedFull = tracker.resolveIdentifier("shared");
        const sharedLean = tracker.resolveIdentifierScopeId("shared");
        assert.strictEqual(sharedLean, sharedFull?.scopeId ?? null, "lean and full should agree for shared");

        const localFull = tracker.resolveIdentifier("local");
        const localLean = tracker.resolveIdentifierScopeId("local");
        assert.strictEqual(localLean, localFull?.scopeId ?? null, "lean and full should agree for local");

        // unknown symbol
        const unknownFull = tracker.resolveIdentifier("unknown");
        const unknownLean = tracker.resolveIdentifierScopeId("unknown");
        assert.strictEqual(unknownLean, unknownFull?.scopeId ?? null, "lean and full should agree for unknown");

        // Suppresses unused-variable warning
        void programScope;
    });

    void it("uses the identifier cache to avoid redundant scope-chain walks", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("program");
        tracker.declare("cached", { name: "cached" });
        const functionScope = tracker.enterScope("function");

        // First call populates the cache
        const first = tracker.resolveIdentifierScopeId("cached", functionScope.id);

        // Second call should hit the cache and return the same value
        const second = tracker.resolveIdentifierScopeId("cached", functionScope.id);

        assert.strictEqual(first, second);
        assert.ok(first !== null, "Should have found the declaration");
    });

    void it("returns null when no scope is active and no scopeId is given", () => {
        const tracker = new ScopeTracker({ enabled: true });
        // No scopes entered yet
        const result = tracker.resolveIdentifierScopeId("anything");
        assert.strictEqual(result, null);
    });

    void it("returns null for an unknown scopeId argument", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program");
        tracker.declare("sym", { name: "sym" });

        const result = tracker.resolveIdentifierScopeId("sym", "scope-does-not-exist");

        assert.strictEqual(result, null, "Should return null for a scope that was never created");
    });

    void it("is consistent with getScopeDependents (invalidation correctness smoke-test)", () => {
        // Build a scope graph where a function references a global declared in the program scope.
        // Verify that collectScopeDependents (via getScopeDependents) still produces the same
        // results after being updated to use resolveIdentifierScopeId internally.
        const tracker = new ScopeTracker({ enabled: true });

        const programScope = tracker.enterScope("program");
        tracker.declare("counter", { name: "counter" });

        const fnScope = tracker.enterScope("function");
        tracker.reference("counter", { name: "counter" });
        tracker.exitScope();

        tracker.exitScope();

        const dependents = tracker.getScopeDependents(programScope.id);
        assert.ok(dependents.length === 1, "program scope should have one dependent");
        assert.strictEqual(dependents[0].dependentScopeId, fnScope.id);
        assert.deepStrictEqual(dependents[0].symbols, ["counter"]);
    });
});
