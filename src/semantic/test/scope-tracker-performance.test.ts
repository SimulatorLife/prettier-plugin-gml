import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

void describe("ScopeTracker performance optimizations", () => {
    void describe("descendant scope traversal", () => {
        void it("handles deep nesting efficiently", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // Create a deep hierarchy: root -> 10 levels -> 5 children each
            const rootScope = tracker.enterScope("program");

            function createNestedScopes(parentDepth: number, maxDepth: number, childrenPerLevel: number): void {
                if (parentDepth >= maxDepth) {
                    return;
                }

                for (let i = 0; i < childrenPerLevel; i++) {
                    tracker.withScope("block", () => {
                        createNestedScopes(parentDepth + 1, maxDepth, childrenPerLevel);
                    });
                }
            }

            // Build the tree
            createNestedScopes(0, 5, 5);

            // Measure descendant retrieval
            const start = performance.now();
            const descendants = tracker.getDescendantScopes(rootScope.id);
            const elapsed = performance.now() - start;

            // Should complete quickly (< 50ms) even with hundreds of scopes
            assert.ok(elapsed < 50, `Descendant traversal took ${elapsed}ms, expected < 50ms`);
            assert.ok(descendants.length > 0, "Should have descendants");
        });
    });

    void describe("batch symbol queries", () => {
        void it("processes multiple symbols efficiently", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // Create many scopes with many symbols
            tracker.enterScope("program");

            const symbolCount = 100;
            const symbols: string[] = [];

            for (let i = 0; i < symbolCount; i++) {
                const name = `symbol_${i}`;
                symbols.push(name);
                tracker.declare(name, { name });
                tracker.reference(name, { name });
            }

            // Measure batch query
            const start = performance.now();
            const results = tracker.getBatchSymbolOccurrences(symbols);
            const elapsed = performance.now() - start;

            // Should complete quickly (< 100ms) for 100 symbols
            assert.ok(elapsed < 100, `Batch query took ${elapsed}ms, expected < 100ms`);
            assert.equal(results.size, symbolCount, "Should retrieve all symbols");
        });
    });

    void describe("cache invalidation", () => {
        void it("invalidates caches efficiently for large scope trees", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // Create nested scopes with symbols
            tracker.enterScope("program");

            const scopeIds: string[] = [];
            for (let i = 0; i < 50; i++) {
                const scope = tracker.enterScope("block");
                scopeIds.push(scope.id);

                for (let j = 0; j < 10; j++) {
                    const name = `var_${i}_${j}`;
                    tracker.declare(name, { name });
                }
            }

            // Measure invalidation through new declaration
            const start = performance.now();
            tracker.declare("new_symbol", { name: "new_symbol" });
            const elapsed = performance.now() - start;

            // Should complete quickly (< 10ms) even with many scopes
            assert.ok(elapsed < 10, `Cache invalidation took ${elapsed}ms, expected < 10ms`);
        });
    });

    void describe("sorting operations", () => {
        void it("sorts scope dependencies efficiently", () => {
            const tracker = new ScopeTracker({ enabled: true });

            // Create many scopes with dependencies
            tracker.enterScope("program");

            const scopeIds: string[] = [];
            for (let i = 0; i < 50; i++) {
                const scope = tracker.enterScope("function");
                scopeIds.push(scope.id);

                // Create some shared symbols for dependencies
                if (i > 0) {
                    tracker.reference(`shared_symbol_${i % 10}`, { name: `shared_symbol_${i % 10}` });
                }

                tracker.exitScope();
            }

            // Declare shared symbols that create dependencies
            tracker.enterScope("module");
            for (let i = 0; i < 10; i++) {
                tracker.declare(`shared_symbol_${i}`, { name: `shared_symbol_${i}` });
            }

            // Measure dependency queries with sorting
            const start = performance.now();
            for (const scopeId of scopeIds) {
                tracker.getScopeDependencies(scopeId);
            }
            const elapsed = performance.now() - start;

            // Should complete quickly (< 50ms) for all scope queries
            assert.ok(elapsed < 50, `Dependency queries took ${elapsed}ms, expected < 50ms`);
        });
    });

    void describe("getAllDeclarations sorting", () => {
        void it("sorts large declaration sets efficiently", () => {
            const tracker = new ScopeTracker({ enabled: true });

            tracker.enterScope("program");

            // Create many scopes and declarations
            for (let i = 0; i < 100; i++) {
                tracker.withScope("block", () => {
                    for (let j = 0; j < 10; j++) {
                        tracker.declare(`var_${i}_${j}`, { name: `var_${i}_${j}` });
                    }
                });
            }

            // Measure getAllDeclarations which includes sorting
            const start = performance.now();
            const declarations = tracker.getAllDeclarations();
            const elapsed = performance.now() - start;

            // Should complete quickly (< 100ms) for 1000 declarations
            assert.ok(elapsed < 100, `getAllDeclarations took ${elapsed}ms, expected < 100ms`);
            assert.equal(declarations.length, 1000, "Should retrieve all declarations");

            // Verify sorted order
            for (let i = 1; i < declarations.length; i++) {
                const prev = declarations[i - 1];
                const curr = declarations[i];

                if (prev.scopeId === curr.scopeId) {
                    assert.ok(
                        prev.name.localeCompare(curr.name) <= 0,
                        `Declarations should be sorted by name within scope: ${prev.name} vs ${curr.name}`
                    );
                }
            }
        });
    });
});
