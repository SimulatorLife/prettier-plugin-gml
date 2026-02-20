import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

void describe("ScopeTracker: removeScopesByPath", () => {
    void describe("return value", () => {
        void it("returns 0 for null path", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            assert.equal(tracker.removeScopesByPath(null), 0);
        });

        void it("returns 0 for undefined path", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            assert.equal(tracker.removeScopesByPath(undefined), 0);
        });

        void it("returns 0 for empty string path", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            assert.equal(tracker.removeScopesByPath(""), 0);
        });

        void it("returns 0 when the path has no indexed scopes", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "other.gml" });
            assert.equal(tracker.removeScopesByPath("file.gml"), 0);
        });

        void it("returns the count of removed scopes (direct only)", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.exitScope();
            // One scope with that path
            assert.equal(tracker.removeScopesByPath("file.gml"), 1);
        });

        void it("counts descendants in the returned total", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.enterScope("function", { path: "file.gml", name: "fn" });
            tracker.enterScope("block");
            tracker.exitScope(); // block
            tracker.exitScope(); // function
            tracker.exitScope(); // program

            // 3 scopes: program, function, block
            assert.equal(tracker.removeScopesByPath("file.gml"), 3);
        });
    });

    void describe("getScopesByPath after removal", () => {
        void it("returns empty array after all scopes for a path are removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.exitScope();

            tracker.removeScopesByPath("file.gml");

            assert.deepEqual(tracker.getScopesByPath("file.gml"), []);
        });

        void it("does not affect scopes for other paths", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "a.gml" });
            tracker.exitScope();
            tracker.enterScope("program", { path: "b.gml" });
            tracker.exitScope();

            tracker.removeScopesByPath("a.gml");

            assert.equal(tracker.getScopesByPath("a.gml").length, 0, "a.gml scopes should be gone");
            assert.equal(tracker.getScopesByPath("b.gml").length, 1, "b.gml scopes should remain");
        });
    });

    void describe("symbol index cleanup", () => {
        void it("removes symbols only declared in the removed scopes from the index", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.declare("onlyInFile", {
                name: "onlyInFile",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 10, index: 10 }
            });
            tracker.exitScope();

            tracker.removeScopesByPath("file.gml");

            // The symbol no longer lives anywhere, so getFilePathsReferencingSymbol should return empty
            assert.equal(tracker.getFilePathsReferencingSymbol("onlyInFile").size, 0);
            // And getAllSymbolsSummary should not include it
            const summary = tracker.getAllSymbolsSummary();
            assert.ok(!summary.some((s) => s.name === "onlyInFile"), "Symbol should be removed from index");
        });

        void it("retains symbols declared in surviving scopes", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "a.gml" });
            tracker.declare("shared", {
                name: "shared",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 6, index: 6 }
            });
            tracker.exitScope();

            tracker.enterScope("program", { path: "b.gml" });
            tracker.declare("shared", {
                name: "shared",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 6, index: 6 }
            });
            tracker.exitScope();

            tracker.removeScopesByPath("a.gml");

            // "shared" still declared in b.gml
            const summary = tracker.getAllSymbolsSummary();
            const sharedEntry = summary.find((s) => s.name === "shared");
            assert.ok(sharedEntry, "Symbol should still exist in index");
            assert.equal(sharedEntry.declarationCount, 1, "One declaration remaining in b.gml");
        });

        void it("removes references from removed scopes from the symbol index", () => {
            const tracker = new ScopeTracker({ enabled: true });
            // Declare in a.gml
            tracker.enterScope("program", { path: "a.gml" });
            tracker.declare("helper", {
                name: "helper",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 6, index: 6 }
            });
            tracker.exitScope();

            // Reference from b.gml (to be removed)
            tracker.enterScope("program", { path: "b.gml" });
            tracker.reference("helper", {
                name: "helper",
                start: { line: 5, column: 0, index: 40 },
                end: { line: 5, column: 6, index: 46 }
            });
            tracker.exitScope();

            // Before removal, b.gml references helper
            assert.ok(tracker.getFilePathsReferencingSymbol("helper").has("b.gml"));

            tracker.removeScopesByPath("b.gml");

            // After removal, no file references helper
            assert.equal(tracker.getFilePathsReferencingSymbol("helper").size, 0);
        });
    });

    void describe("parent-child index cleanup", () => {
        void it("removes the scope from its non-removed parent's children set", () => {
            const tracker = new ScopeTracker({ enabled: true });
            const parent = tracker.enterScope("program", { path: "parent.gml" });
            const child = tracker.enterScope("function", { path: "child.gml", name: "fn" });
            tracker.exitScope(); // child
            tracker.exitScope(); // parent

            tracker.removeScopesByPath("child.gml");

            // Parent scope should still exist
            assert.ok(tracker.getScopeMetadata(parent.id), "Parent scope should still exist");
            // Descendants of parent (the removed child) should no longer be returned
            const descendants = tracker.getDescendantScopes(parent.id);
            assert.ok(
                !descendants.some((d) => d.scopeId === child.id),
                "Removed child should not appear as descendant"
            );
        });

        void it("does not attempt to update parent when parent is also being removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.enterScope("function", { path: "file.gml", name: "fn" });
            tracker.exitScope();
            tracker.exitScope();

            // Both scopes removed – should not throw
            assert.doesNotThrow(() => {
                tracker.removeScopesByPath("file.gml");
            });
        });
    });

    void describe("lookup cache invalidation", () => {
        void it("resolveIdentifier returns null after the declaring scope is removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            const scope = tracker.enterScope("program", { path: "file.gml" });
            tracker.declare("myVar", {
                name: "myVar",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 5, index: 5 }
            });
            tracker.exitScope();

            // Prime the cache
            const before = tracker.resolveIdentifier("myVar", scope.id);
            assert.ok(before, "Should resolve before removal");

            tracker.removeScopesByPath("file.gml");

            // After removal the scope no longer exists so resolveIdentifier should return null
            const after = tracker.resolveIdentifier("myVar", scope.id);
            assert.equal(after, null, "Should return null after scope removed");
        });

        void it("lookup returns null after the declaring scope is removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "file.gml" });
            tracker.declare("myVar", {
                name: "myVar",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 5, index: 5 }
            });

            // Prime the lookup cache while the scope is on the stack
            const before = tracker.lookup("myVar");
            assert.ok(before, "Should find symbol before removal");

            tracker.exitScope();
            tracker.removeScopesByPath("file.gml");

            // Stack-based lookup cache should be cleared
            tracker.enterScope("other");
            const after = tracker.lookup("myVar");
            assert.equal(after, null, "lookup should return null after declaring scope is removed");
            tracker.exitScope();
        });
    });

    void describe("rootScope cleanup", () => {
        void it("sets rootScope to null when the root scope is removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            tracker.enterScope("program", { path: "main.gml" });
            tracker.exitScope();

            tracker.removeScopesByPath("main.gml");

            assert.equal(tracker.getRootScope(), null, "rootScope should be null after removal");
        });

        void it("does not clear rootScope when a non-root scope is removed", () => {
            const tracker = new ScopeTracker({ enabled: true });
            const root = tracker.enterScope("program", { path: "main.gml" });
            tracker.enterScope("function", { path: "other.gml", name: "fn" });
            tracker.exitScope();
            tracker.exitScope();

            tracker.removeScopesByPath("other.gml");

            assert.equal(tracker.getRootScope(), root, "rootScope should remain after removing a non-root scope");
        });
    });

    void describe("hot-reload workflow integration", () => {
        void it("supports re-indexing a file after removal", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // Initial analysis pass
            tracker.enterScope("program", { path: "game.gml" });
            tracker.declare("counter", {
                name: "counter",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 7, index: 7 }
            });
            tracker.exitScope();

            // Verify initial state
            assert.equal(tracker.getScopesByPath("game.gml").length, 1);

            // File changed: remove stale scopes
            const removed = tracker.removeScopesByPath("game.gml");
            assert.equal(removed, 1, "One scope removed");
            assert.equal(tracker.getScopesByPath("game.gml").length, 0);

            // Re-analyze the updated file
            tracker.enterScope("program", { path: "game.gml" });
            tracker.declare("counter", {
                name: "counter",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 7, index: 7 }
            });
            tracker.declare("score", {
                name: "score",
                start: { line: 2, column: 0, index: 8 },
                end: { line: 2, column: 5, index: 13 }
            });
            tracker.exitScope();

            // Should reflect the updated state
            assert.equal(tracker.getScopesByPath("game.gml").length, 1);

            const summary = tracker.getAllSymbolsSummary();
            assert.ok(
                summary.some((s) => s.name === "score"),
                "Newly added symbol should appear after re-index"
            );
        });

        void it("correctly reflects dependency changes after file re-index", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // libraryScope declares "util"
            tracker.enterScope("program", { path: "library.gml" });
            tracker.declare("util", {
                name: "util",
                start: { line: 1, column: 0, index: 0 },
                end: { line: 1, column: 4, index: 4 }
            });
            tracker.exitScope();

            // consumerScope references "util"
            tracker.enterScope("program", { path: "consumer.gml" });
            tracker.reference("util", {
                name: "util",
                start: { line: 3, column: 0, index: 20 },
                end: { line: 3, column: 4, index: 24 }
            });
            tracker.exitScope();

            assert.ok(
                tracker.getFilePathsReferencingSymbol("util").has("consumer.gml"),
                "consumer.gml should reference util before removal"
            );

            // consumer.gml is edited to no longer reference util
            tracker.removeScopesByPath("consumer.gml");
            tracker.enterScope("program", { path: "consumer.gml" });
            // No reference to util in updated version
            tracker.exitScope();

            assert.equal(
                tracker.getFilePathsReferencingSymbol("util").size,
                0,
                "No file should reference util after consumer.gml is updated"
            );
        });

        void it("handles repeated remove-and-reindex cycles without state corruption", () => {
            const tracker = new ScopeTracker({ enabled: true });

            for (let cycle = 0; cycle < 5; cycle++) {
                // Each cycle, re-add a file scope with fresh declarations
                tracker.enterScope("program", { path: "cycled.gml" });
                tracker.declare(`sym${cycle}`, {
                    name: `sym${cycle}`,
                    start: { line: 1, column: 0, index: 0 },
                    end: { line: 1, column: 4, index: 4 }
                });
                tracker.exitScope();

                if (cycle < 4) {
                    tracker.removeScopesByPath("cycled.gml");
                }
            }

            // After the final pass (no removal), only the last cycle's symbol should remain
            const summary = tracker.getAllSymbolsSummary();
            const names = new Set(summary.map((s) => s.name));
            assert.ok(names.has("sym4"), "Final symbol sym4 should be present");
            // All earlier symbols should have been cleaned up
            for (let i = 0; i < 4; i++) {
                assert.ok(!names.has(`sym${i}`), `Stale symbol sym${i} should have been removed`);
            }
        });
    });
});
