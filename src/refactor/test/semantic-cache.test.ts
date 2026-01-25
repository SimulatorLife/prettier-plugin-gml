import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SemanticQueryCache } from "../src/semantic-cache.js";
import type { DependentSymbol, FileSymbol, PartialSemanticAnalyzer, SymbolOccurrence } from "../src/types.js";

void describe("SemanticQueryCache", () => {
    void describe("getSymbolOccurrences", () => {
        void it("caches symbol occurrence queries", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter required by interface
                getSymbolOccurrences: async (_name: string) => {
                    callCount++;
                    return [{ path: "test.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result1 = await cache.getSymbolOccurrences("player_hp");
            const result2 = await cache.getSymbolOccurrences("player_hp");

            assert.equal(callCount, 1, "Semantic analyzer should only be called once");
            assert.deepEqual(result1, result2, "Cached result should match first result");
        });

        void it("returns different results for different symbols", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async (name: string) => {
                    if (name === "player_hp") {
                        return [{ path: "player.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                    }
                    return [{ path: "enemy.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result1 = await cache.getSymbolOccurrences("player_hp");
            const result2 = await cache.getSymbolOccurrences("enemy_hp");

            assert.equal(result1[0].path, "player.gml");
            assert.equal(result2[0].path, "enemy.gml");
        });

        void it("bypasses cache when disabled", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => {
                    callCount++;
                    return [];
                }
            };

            const cache = new SemanticQueryCache(semantic, { enabled: false });
            await cache.getSymbolOccurrences("test");
            await cache.getSymbolOccurrences("test");

            assert.equal(callCount, 2, "Cache should be bypassed");
        });

        void it("returns empty array when semantic analyzer lacks method", async () => {
            const semantic: PartialSemanticAnalyzer = {};
            const cache = new SemanticQueryCache(semantic);
            const result = await cache.getSymbolOccurrences("test");

            assert.deepEqual(result, []);
        });

        void it("respects TTL expiration", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => {
                    callCount++;
                    return [{ path: "test.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                }
            };

            const cache = new SemanticQueryCache(semantic, { ttlMs: 100 });
            await cache.getSymbolOccurrences("test");

            // Wait for TTL to expire
            await new Promise((resolve) => setTimeout(resolve, 150));

            await cache.getSymbolOccurrences("test");

            assert.equal(callCount, 2, "Expired entry should trigger new query");
        });
    });

    void describe("getFileSymbols", () => {
        void it("caches file symbol queries", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter required by interface
                getFileSymbols: async (_path: string) => {
                    callCount++;
                    return [{ id: "gml/script/test" }] as Array<FileSymbol>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result1 = await cache.getFileSymbols("test.gml");
            const result2 = await cache.getFileSymbols("test.gml");

            assert.equal(callCount, 1, "Semantic analyzer should only be called once");
            assert.deepEqual(result1, result2);
        });

        void it("handles null results from semantic analyzer", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getFileSymbols: async () => null as unknown as Array<FileSymbol>
            };

            const cache = new SemanticQueryCache(semantic);
            const result = await cache.getFileSymbols("test.gml");

            assert.deepEqual(result, []);
        });

        void it("returns empty array when semantic analyzer lacks method", async () => {
            const semantic: PartialSemanticAnalyzer = {};
            const cache = new SemanticQueryCache(semantic);
            const result = await cache.getFileSymbols("test.gml");

            assert.deepEqual(result, []);
        });
    });

    void describe("getDependents", () => {
        void it("caches dependent symbol queries", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter required by interface
                getDependents: async (_ids: Array<string>) => {
                    callCount++;
                    return [{ symbolId: "gml/script/dependent", filePath: "dep.gml" }] as Array<DependentSymbol>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result1 = await cache.getDependents(["gml/script/test"]);
            const result2 = await cache.getDependents(["gml/script/test"]);

            assert.equal(callCount, 1, "Semantic analyzer should only be called once");
            assert.deepEqual(result1, result2);
        });

        void it("normalizes symbol ID order for cache key", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                getDependents: async () => {
                    callCount++;
                    return [];
                }
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getDependents(["a", "b", "c"]);
            await cache.getDependents(["c", "b", "a"]);

            assert.equal(callCount, 1, "Order-independent cache key should match");
        });

        void it("returns empty array for empty input", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getDependents: async () => {
                    throw new Error("Should not be called");
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result = await cache.getDependents([]);

            assert.deepEqual(result, []);
        });

        void it("handles null results from semantic analyzer", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getDependents: async () => null as unknown as Array<DependentSymbol>
            };

            const cache = new SemanticQueryCache(semantic);
            const result = await cache.getDependents(["test"]);

            assert.deepEqual(result, []);
        });
    });

    void describe("hasSymbol", () => {
        void it("caches symbol existence queries", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter required by interface
                hasSymbol: async (_id: string) => {
                    callCount++;
                    return true;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            const result1 = await cache.hasSymbol("gml/script/test");
            const result2 = await cache.hasSymbol("gml/script/test");

            assert.equal(callCount, 1);
            assert.equal(result1, result2);
        });

        void it("returns true when semantic analyzer lacks method", async () => {
            const semantic: PartialSemanticAnalyzer = {};
            const cache = new SemanticQueryCache(semantic);
            const result = await cache.hasSymbol("test");

            assert.equal(result, true);
        });
    });

    void describe("invalidation", () => {
        void it("invalidateAll clears all caches", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => {
                    callCount++;
                    return [];
                }
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getSymbolOccurrences("test");
            cache.invalidateAll();
            await cache.getSymbolOccurrences("test");

            assert.equal(callCount, 2, "Invalidation should force new query");
        });

        void it("invalidateFile clears file-specific cache", async () => {
            let fileCallCount = 0;
            let occCallCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter required by interface
                getFileSymbols: async (_path: string) => {
                    fileCallCount++;
                    return [{ id: "gml/script/test" }] as Array<FileSymbol>;
                },
                getSymbolOccurrences: async () => {
                    occCallCount++;
                    return [{ path: "test.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getFileSymbols("test.gml");
            await cache.getSymbolOccurrences("player_hp");

            cache.invalidateFile("test.gml");

            await cache.getFileSymbols("test.gml");
            await cache.getSymbolOccurrences("player_hp");

            assert.equal(fileCallCount, 2, "File symbols should be re-queried");
            assert.equal(occCallCount, 2, "Occurrences referencing the file should be re-queried");
        });

        void it("invalidateFile does not clear unrelated occurrences", async () => {
            let callCount = 0;
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => {
                    callCount++;
                    return [{ path: "other.gml", start: 0, end: 10 }] as Array<SymbolOccurrence>;
                }
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getSymbolOccurrences("test");
            cache.invalidateFile("different.gml");
            await cache.getSymbolOccurrences("test");

            assert.equal(callCount, 1, "Unrelated occurrences should remain cached");
        });
    });

    void describe("statistics", () => {
        void it("tracks cache hits and misses", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => []
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getSymbolOccurrences("test");
            await cache.getSymbolOccurrences("test");
            await cache.getSymbolOccurrences("other");

            const stats = cache.getStats();
            assert.equal(stats.hits, 1, "One cache hit");
            assert.equal(stats.misses, 2, "Two cache misses");
        });

        void it("tracks evictions when cache is full", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => []
            };

            const cache = new SemanticQueryCache(semantic, { maxSize: 2 });
            await cache.getSymbolOccurrences("a");
            await cache.getSymbolOccurrences("b");
            await cache.getSymbolOccurrences("c");

            const stats = cache.getStats();
            assert.equal(stats.evictions, 1, "One entry should be evicted");
        });

        void it("reports total cache size across all cache types", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => [],
                getFileSymbols: async () => [],
                hasSymbol: async () => true
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getSymbolOccurrences("test");
            await cache.getFileSymbols("test.gml");
            await cache.hasSymbol("gml/script/test");

            const stats = cache.getStats();
            assert.equal(stats.size, 3, "Size should include all cache types");
        });

        void it("resetStats clears statistics", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => []
            };

            const cache = new SemanticQueryCache(semantic);
            await cache.getSymbolOccurrences("test");
            await cache.getSymbolOccurrences("test");

            cache.resetStats();
            const stats = cache.getStats();

            assert.equal(stats.hits, 0);
            assert.equal(stats.misses, 0);
        });
    });

    void describe("configuration", () => {
        void it("respects maxSize limit", async () => {
            const semantic: PartialSemanticAnalyzer = {
                getSymbolOccurrences: async () => []
            };

            const cache = new SemanticQueryCache(semantic, { maxSize: 2 });
            await cache.getSymbolOccurrences("a");
            await cache.getSymbolOccurrences("b");
            await cache.getSymbolOccurrences("c");

            const stats = cache.getStats();
            assert.equal(stats.size, 2, "Cache should not exceed maxSize");
        });

        void it("uses default configuration values", () => {
            const semantic: PartialSemanticAnalyzer = {};
            const cache = new SemanticQueryCache(semantic);

            const stats = cache.getStats();
            assert.equal(stats.hits, 0);
            assert.equal(stats.misses, 0);
            assert.equal(stats.evictions, 0);
        });

        void it("works with null semantic analyzer", async () => {
            const cache = new SemanticQueryCache(null);
            const occurrences = await cache.getSymbolOccurrences("test");
            const fileSymbols = await cache.getFileSymbols("test.gml");
            const dependents = await cache.getDependents(["test"]);
            const exists = await cache.hasSymbol("test");

            assert.deepEqual(occurrences, []);
            assert.deepEqual(fileSymbols, []);
            assert.deepEqual(dependents, []);
            assert.equal(exists, true);
        });
    });
});
