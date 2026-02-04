import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

void describe("ScopeTracker: exportModifiedOccurrences", () => {
    void it("exports only scopes modified after given timestamp", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Create initial scope with declarations
        const scope1 = tracker.enterScope("function", { name: "func1" });
        tracker.declare("x", { name: "x", scopeId: scope1.id, classifications: ["local"] });
        tracker.exitScope();
        const timestamp1 = Date.now();

        // Small delay to ensure different timestamps
        const delayMs = 10;
        const start = Date.now();
        while (Date.now() - start < delayMs) {
            // Busy wait
        }

        // Create second scope after the checkpoint
        const scope2 = tracker.enterScope("function", { name: "func2" });
        tracker.declare("y", { name: "y", scopeId: scope2.id, classifications: ["local"] });
        tracker.exitScope();

        // Export only scopes modified after timestamp1
        const modified = tracker.exportModifiedOccurrences(timestamp1);

        assert.strictEqual(modified.length, 1, "Should export only 1 modified scope");
        assert.strictEqual(modified[0].scopeId, scope2.id);
        assert.strictEqual(modified[0].identifiers.length, 1);
        assert.strictEqual(modified[0].identifiers[0].name, "y");
    });

    void it("exports multiple modified scopes", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Create first scope
        const scope1 = tracker.enterScope("function", { name: "func1" });
        tracker.declare("a", { name: "a", scopeId: scope1.id, classifications: ["local"] });
        tracker.exitScope();

        const checkpoint = Date.now();

        // Small delay
        const delayMs = 10;
        const start = Date.now();
        while (Date.now() - start < delayMs) {
            // Busy wait
        }

        // Create two more scopes after checkpoint
        const scope2 = tracker.enterScope("function", { name: "func2" });
        tracker.declare("b", { name: "b", scopeId: scope2.id, classifications: ["local"] });
        tracker.exitScope();

        const scope3 = tracker.enterScope("function", { name: "func3" });
        tracker.declare("c", { name: "c", scopeId: scope3.id, classifications: ["local"] });
        tracker.exitScope();

        const modified = tracker.exportModifiedOccurrences(checkpoint);

        assert.strictEqual(modified.length, 2, "Should export 2 modified scopes");
        const scopeIds = modified.map((s) => s.scopeId).sort();
        assert.deepStrictEqual(scopeIds, [scope2.id, scope3.id].sort());
    });

    void it("excludes references when includeReferences is false", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("function", { name: "test" });
        tracker.declare("x", { name: "x", scopeId: scope.id, classifications: ["local"] });
        tracker.reference("x", { start: { line: 1, index: 0 }, end: { line: 1, index: 1 } }, { kind: "variable" });
        tracker.reference("x", { start: { line: 2, index: 0 }, end: { line: 2, index: 1 } }, { kind: "variable" });
        tracker.exitScope();

        const checkpoint = 0; // Export all
        const withRefs = tracker.exportModifiedOccurrences(checkpoint, true);
        const withoutRefs = tracker.exportModifiedOccurrences(checkpoint, false);

        assert.strictEqual(withRefs.length, 1);
        assert.strictEqual(withRefs[0].identifiers[0].references.length, 2);

        assert.strictEqual(withoutRefs.length, 1);
        assert.strictEqual(withoutRefs[0].identifiers[0].references.length, 0);
    });

    void it("returns empty array when no scopes modified after timestamp", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("function", { name: "test" });
        tracker.declare("x", { name: "x", scopeId: scope.id, classifications: ["local"] });
        tracker.exitScope();

        // Use future timestamp
        const futureTimestamp = Date.now() + 10_000;
        const modified = tracker.exportModifiedOccurrences(futureTimestamp);

        assert.strictEqual(modified.length, 0);
    });

    void it("exports all scopes when timestamp is 0", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope1 = tracker.enterScope("function", { name: "func1" });
        tracker.declare("a", { name: "a", scopeId: scope1.id, classifications: ["local"] });
        tracker.exitScope();

        const scope2 = tracker.enterScope("function", { name: "func2" });
        tracker.declare("b", { name: "b", scopeId: scope2.id, classifications: ["local"] });
        tracker.exitScope();

        const all = tracker.exportModifiedOccurrences(0);

        assert.strictEqual(all.length, 2, "Should export all scopes when timestamp is 0");
    });

    void it("preserves scope modification metadata in export", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("function", { name: "test" });
        tracker.declare("x", { name: "x", scopeId: scope.id, classifications: ["local"] });
        tracker.exitScope();

        const exported = tracker.exportModifiedOccurrences(0);

        assert.strictEqual(exported.length, 1);
        assert.ok(exported[0].lastModified > 0, "Should have lastModified timestamp");
        assert.ok(exported[0].modificationCount > 0, "Should have modification count");
    });

    void it("clones occurrences to prevent external mutation", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("function", { name: "test" });
        tracker.declare("x", { name: "x", scopeId: scope.id, classifications: ["local"] });
        tracker.exitScope();

        const exported = tracker.exportModifiedOccurrences(0);
        const originalDecl = exported[0].identifiers[0].declarations[0];

        // Mutate the exported occurrence
        originalDecl.name = "mutated";

        // Export again and verify it wasn't affected
        const reExported = tracker.exportModifiedOccurrences(0);
        const newDecl = reExported[0].identifiers[0].declarations[0];

        assert.strictEqual(newDecl.name, "x", "Original data should not be mutated");
    });

    void it("handles scopes with no identifier occurrences", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Create a scope but don't declare/reference anything
        tracker.enterScope("block", { name: "empty" });
        tracker.exitScope();

        const exported = tracker.exportModifiedOccurrences(0);

        // Empty scopes should not be included in export
        assert.strictEqual(exported.length, 0);
    });

    void it("exports scopes with declarations but no references when includeReferences is false", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const scope = tracker.enterScope("function", { name: "test" });
        tracker.declare("x", { name: "x", scopeId: scope.id, classifications: ["local"] });
        tracker.exitScope();

        const exported = tracker.exportModifiedOccurrences(0, false);

        assert.strictEqual(exported.length, 1);
        assert.strictEqual(exported[0].identifiers.length, 1);
        assert.strictEqual(exported[0].identifiers[0].declarations.length, 1);
        assert.strictEqual(exported[0].identifiers[0].references.length, 0);
    });

    void it("performance: avoids cloning for unmodified scopes", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Create many old scopes
        for (let i = 0; i < 100; i++) {
            const scope = tracker.enterScope("function", { name: `old_${i}` });
            tracker.declare(`var_${i}`, { name: `var_${i}`, scopeId: scope.id, classifications: ["local"] });
            tracker.exitScope();
        }

        const checkpoint = Date.now();

        // Small delay
        const delayMs = 10;
        const start = Date.now();
        while (Date.now() - start < delayMs) {
            // Busy wait
        }

        // Create one new scope
        const newScope = tracker.enterScope("function", { name: "new_func" });
        tracker.declare("new_var", { name: "new_var", scopeId: newScope.id, classifications: ["local"] });
        tracker.exitScope();

        // This should only process the 1 modified scope, not all 101
        const modified = tracker.exportModifiedOccurrences(checkpoint);

        assert.strictEqual(modified.length, 1, "Should only export the 1 modified scope");
        assert.strictEqual(modified[0].identifiers[0].name, "new_var");
    });
});
