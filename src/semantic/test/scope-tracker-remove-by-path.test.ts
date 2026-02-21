import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

void describe("ScopeTracker.removeScopesByPath", () => {
    void it("returns empty result for null path", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("x", { start: { line: 1, index: 0 }, end: { line: 1, index: 1 } });
        tracker.exitScope();

        const result = tracker.removeScopesByPath(null);

        assert.deepEqual(result.removedScopeIds, []);
        assert.equal(result.affectedSymbols.size, 0);
    });

    void it("returns empty result for empty string path", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.exitScope();

        const result = tracker.removeScopesByPath("");

        assert.deepEqual(result.removedScopeIds, []);
        assert.equal(result.affectedSymbols.size, 0);
    });

    void it("returns empty result when tracker is disabled", () => {
        const tracker = new ScopeTracker({ enabled: false });

        const result = tracker.removeScopesByPath("/a.gml");

        assert.deepEqual(result.removedScopeIds, []);
        assert.equal(result.affectedSymbols.size, 0);
    });

    void it("returns empty result when path has no associated scopes", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.exitScope();

        const result = tracker.removeScopesByPath("/unknown.gml");

        assert.deepEqual(result.removedScopeIds, []);
        assert.equal(result.affectedSymbols.size, 0);
    });

    void it("removes a single root scope by path and returns its ID", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        const scopeId = tracker.currentScope().id;
        tracker.declare("hp", { start: { line: 1, index: 0 }, end: { line: 1, index: 2 } });
        tracker.exitScope();

        const result = tracker.removeScopesByPath("/a.gml");

        assert.ok(result.removedScopeIds.includes(scopeId));
        assert.ok(result.affectedSymbols.has("hp"));
        // Scope should no longer exist
        assert.equal(tracker.getScopeMetadata(scopeId), null);
    });

    void it("removes descendant scopes along with the root path scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        const rootId = tracker.currentScope().id;
        tracker.enterScope("function");
        const fnId = tracker.currentScope().id;
        tracker.declare("localVar", { start: { line: 2, index: 0 }, end: { line: 2, index: 8 } });
        tracker.exitScope();
        tracker.exitScope();

        const result = tracker.removeScopesByPath("/a.gml");

        assert.ok(result.removedScopeIds.includes(rootId), "root scope should be removed");
        assert.ok(result.removedScopeIds.includes(fnId), "descendant function scope should be removed");
        assert.ok(result.affectedSymbols.has("localVar"));
        assert.equal(tracker.getScopeMetadata(rootId), null);
        assert.equal(tracker.getScopeMetadata(fnId), null);
    });

    void it("collects both declared and referenced symbols as affectedSymbols", () => {
        const tracker = new ScopeTracker({ enabled: true });
        // Declare globalVar in a separate scope (not removed)
        tracker.enterScope("program", { path: "/global.gml" });
        tracker.declare("globalVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } });
        tracker.exitScope();

        // Reference globalVar from the scope that will be removed
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.reference("globalVar", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } });
        tracker.declare("localVar", { start: { line: 2, index: 0 }, end: { line: 2, index: 8 } });
        tracker.exitScope();

        const result = tracker.removeScopesByPath("/a.gml");

        assert.ok(result.affectedSymbols.has("globalVar"), "referenced symbol should be in affectedSymbols");
        assert.ok(result.affectedSymbols.has("localVar"), "declared symbol should be in affectedSymbols");
    });

    void it("removes entries from symbolToScopesIndex for removed scopes", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("score", { start: { line: 1, index: 0 }, end: { line: 1, index: 5 } });
        tracker.exitScope();

        tracker.removeScopesByPath("/a.gml");

        // After removal, getScopesForSymbol should return empty (no scopes)
        const scopes = tracker.getScopesForSymbol("score");
        assert.deepEqual(scopes, []);
    });

    void it("does not affect scopes associated with other paths", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("varA", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } });
        const scopeA = tracker.currentScope().id;
        tracker.exitScope();

        tracker.enterScope("program", { path: "/b.gml" });
        tracker.declare("varB", { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } });
        const scopeB = tracker.currentScope().id;
        tracker.exitScope();

        tracker.removeScopesByPath("/a.gml");

        // Scope B should be unaffected
        assert.notEqual(tracker.getScopeMetadata(scopeB), null, "scope B should still exist");
        const bScopes = tracker.getScopesForSymbol("varB");
        assert.ok(bScopes.includes(scopeB), "varB should still be indexed");

        // Scope A should be gone
        assert.equal(tracker.getScopeMetadata(scopeA), null, "scope A should be removed");
    });

    void it("returns removedScopeIds in sorted order", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.enterScope("function");
        tracker.exitScope();
        tracker.enterScope("function");
        tracker.exitScope();
        tracker.exitScope();

        const result = tracker.removeScopesByPath("/a.gml");

        const sorted = [...result.removedScopeIds].sort();
        assert.deepEqual(result.removedScopeIds, sorted, "removedScopeIds should be sorted");
    });

    void it("normalizes Windows-style path separators", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/project/scripts/a.gml" });
        const scopeId = tracker.currentScope().id;
        tracker.declare("win32Var", { start: { line: 1, index: 0 }, end: { line: 1, index: 7 } });
        tracker.exitScope();

        // Remove using Windows-style path (backslashes)
        const result = tracker.removeScopesByPath(String.raw`\project\scripts\a.gml`);

        assert.ok(result.removedScopeIds.includes(scopeId), "should resolve backslash path to the same scope");
    });

    void it("allows re-declaring symbols after removal without conflicts", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("hp", { start: { line: 1, index: 0 }, end: { line: 1, index: 2 } });
        tracker.exitScope();

        tracker.removeScopesByPath("/a.gml");

        // Re-add the scope after a simulated file change
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("hp", { start: { line: 1, index: 0 }, end: { line: 1, index: 2 } });
        const newScopeId = tracker.currentScope().id;
        tracker.exitScope();

        const scopes = tracker.getScopesForSymbol("hp");
        assert.deepEqual(scopes, [newScopeId], "only the new scope should be indexed after re-declaration");
    });

    void it("invalidates identifier resolution cache after removal", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.declare("cachedSym", { start: { line: 1, index: 0 }, end: { line: 1, index: 9 } });

        // Trigger caching by performing a lookup while scope is active
        const beforeRemoval = tracker.lookup("cachedSym");
        assert.ok(beforeRemoval, "symbol should be resolvable before removal");

        tracker.exitScope();
        tracker.removeScopesByPath("/a.gml");

        // After removal we re-enter a different scope; lookup should not find the stale entry
        tracker.enterScope("program", { path: "/b.gml" });
        const afterRemoval = tracker.lookup("cachedSym");
        tracker.exitScope();

        assert.equal(afterRemoval, null, "stale cache entry should not survive scope removal");
    });

    void it("getScopesByPath returns empty after removal", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/a.gml" });
        tracker.exitScope();

        assert.ok(tracker.getScopesByPath("/a.gml").length > 0, "should have scopes before removal");

        tracker.removeScopesByPath("/a.gml");

        assert.deepEqual(tracker.getScopesByPath("/a.gml"), [], "should have no scopes after removal");
    });
});
