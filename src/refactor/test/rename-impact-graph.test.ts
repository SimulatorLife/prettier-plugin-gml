/**
 * Tests for rename impact graph computation.
 * Validates dependency graph analysis and critical path finding.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeRenameImpactGraph } from "../src/hot-reload.js";
import type { DependentSymbol, PartialSemanticAnalyzer } from "../src/types.js";

void describe("computeRenameImpactGraph", () => {
    void it("requires a valid symbolId", async () => {
        await assert.rejects(async () => computeRenameImpactGraph("", null), { message: /requires a valid symbolId/ });
    });

    void it("returns minimal graph without semantic analyzer", async () => {
        const graph = await computeRenameImpactGraph("gml/script/scr_test", null);

        assert.equal(graph.totalAffectedSymbols, 1);
        assert.equal(graph.maxDepth, 0);
        assert.equal(graph.rootSymbol, "gml/script/scr_test");
        assert.deepEqual(graph.criticalPath, ["gml/script/scr_test"]);
        assert.ok(graph.estimatedTotalReloadTime > 0);
    });

    void it("builds single-level dependency graph", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [
                        { symbolId: "gml/script/scr_dependent1", filePath: "scripts/dep1.gml" },
                        { symbolId: "gml/script/scr_dependent2", filePath: "scripts/dep2.gml" }
                    ];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        assert.equal(graph.totalAffectedSymbols, 3);
        assert.equal(graph.maxDepth, 1);
        assert.equal(graph.rootSymbol, "gml/script/scr_base");

        const rootNode = graph.nodes.get("gml/script/scr_base");
        assert.ok(rootNode);
        assert.equal(rootNode.isDirectlyAffected, true);
        assert.equal(rootNode.distance, 0);
        assert.equal(rootNode.dependents.length, 2);
        assert.ok(rootNode.dependents.includes("gml/script/scr_dependent1"));
        assert.ok(rootNode.dependents.includes("gml/script/scr_dependent2"));
    });

    void it("builds multi-level dependency graph", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [{ symbolId: "gml/script/scr_mid", filePath: "scripts/mid.gml" }];
                }
                if (symbolIds.includes("gml/script/scr_mid")) {
                    return [{ symbolId: "gml/script/scr_top", filePath: "scripts/top.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        assert.equal(graph.totalAffectedSymbols, 3);
        assert.equal(graph.maxDepth, 2);

        const baseNode = graph.nodes.get("gml/script/scr_base");
        const midNode = graph.nodes.get("gml/script/scr_mid");
        const topNode = graph.nodes.get("gml/script/scr_top");

        assert.ok(baseNode);
        assert.ok(midNode);
        assert.ok(topNode);

        assert.equal(baseNode.distance, 0);
        assert.equal(midNode.distance, 1);
        assert.equal(topNode.distance, 2);

        assert.equal(midNode.isDirectlyAffected, false);
        assert.equal(topNode.isDirectlyAffected, false);
    });

    void it("computes critical path correctly", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [
                        { symbolId: "gml/script/scr_short", filePath: "scripts/short.gml" },
                        { symbolId: "gml/script/scr_long1", filePath: "scripts/long1.gml" }
                    ];
                }
                if (symbolIds.includes("gml/script/scr_long1")) {
                    return [{ symbolId: "gml/script/scr_long2", filePath: "scripts/long2.gml" }];
                }
                if (symbolIds.includes("gml/script/scr_long2")) {
                    return [{ symbolId: "gml/script/scr_long3", filePath: "scripts/long3.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        assert.equal(graph.maxDepth, 3);
        assert.equal(graph.criticalPath.length, 4);
        assert.equal(graph.criticalPath[0], "gml/script/scr_base");
        assert.equal(graph.criticalPath[3], "gml/script/scr_long3");
    });

    void it("handles diamond dependency patterns", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [
                        { symbolId: "gml/script/scr_left", filePath: "scripts/left.gml" },
                        { symbolId: "gml/script/scr_right", filePath: "scripts/right.gml" }
                    ];
                }
                if (symbolIds.includes("gml/script/scr_left") || symbolIds.includes("gml/script/scr_right")) {
                    return [{ symbolId: "gml/script/scr_top", filePath: "scripts/top.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        assert.equal(graph.totalAffectedSymbols, 4);
        assert.equal(graph.maxDepth, 2);

        const topNode = graph.nodes.get("gml/script/scr_top");
        assert.ok(topNode);
        assert.equal(topNode.distance, 2);
    });

    void it("prevents infinite loops with circular dependencies", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_a")) {
                    return [{ symbolId: "gml/script/scr_b", filePath: "scripts/b.gml" }];
                }
                if (symbolIds.includes("gml/script/scr_b")) {
                    return [{ symbolId: "gml/script/scr_a", filePath: "scripts/a.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_a", semantic);

        // Should not hang and should have finite node count
        assert.ok(graph.totalAffectedSymbols >= 1);
        assert.ok(graph.totalAffectedSymbols <= 2);
    });

    void it("estimates reload time", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [
                        { symbolId: "gml/script/scr_dep1", filePath: "scripts/dep1.gml" },
                        { symbolId: "gml/script/scr_dep2", filePath: "scripts/dep2.gml" }
                    ];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        assert.ok(graph.estimatedTotalReloadTime > 0);
        // Base (50ms) + 2 dependents (30ms each) = 110ms minimum
        assert.ok(graph.estimatedTotalReloadTime >= 110);
    });

    void it("includes file paths in nodes", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [{ symbolId: "gml/script/scr_dep", filePath: "scripts/dependent.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        const depNode = graph.nodes.get("gml/script/scr_dep");
        assert.ok(depNode);
        assert.equal(depNode.filePath, "scripts/dependent.gml");
    });

    void it("sets dependsOn relationships correctly", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_base")) {
                    return [{ symbolId: "gml/script/scr_dep", filePath: "scripts/dep.gml" }];
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_base", semantic);

        const depNode = graph.nodes.get("gml/script/scr_dep");
        assert.ok(depNode);
        assert.equal(depNode.dependsOn.length, 1);
        assert.equal(depNode.dependsOn[0], "gml/script/scr_base");
    });

    void it("extracts symbol names correctly", async () => {
        const semantic: PartialSemanticAnalyzer = {
            async getDependents(): Promise<Array<DependentSymbol>> {
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_player_attack", semantic);

        const rootNode = graph.nodes.get("gml/script/scr_player_attack");
        assert.ok(rootNode);
        assert.equal(rootNode.symbolName, "scr_player_attack");
    });

    void it("resolves wide graphs (many dependents per level) correctly", async () => {
        // 10 dependents at level 1, each with 2 unique dependents at level 2.
        // With the old sequential BFS this required 21 sequential async calls;
        // the level-parallel BFS collapses that to 2 batched Promise.all rounds.
        const level1 = Array.from({ length: 10 }, (_, i) => `gml/script/scr_l1_${i}`);
        const level2 = level1.flatMap((id) => {
            const name = id.replace("gml/script/", "");
            return [
                { symbolId: `gml/script/${name}_a`, filePath: `scripts/${name}_a.gml` },
                { symbolId: `gml/script/${name}_b`, filePath: `scripts/${name}_b.gml` }
            ];
        });

        const semantic: PartialSemanticAnalyzer = {
            async getDependents(symbolIds: Array<string>): Promise<Array<DependentSymbol>> {
                if (symbolIds.includes("gml/script/scr_root")) {
                    return level1.map((id) => ({
                        symbolId: id,
                        filePath: `scripts/${id.replace("gml/script/", "")}.gml`
                    }));
                }
                for (const l1Id of level1) {
                    if (symbolIds.includes(l1Id)) {
                        const name = l1Id.replace("gml/script/", "");
                        return [
                            { symbolId: `gml/script/${name}_a`, filePath: `scripts/${name}_a.gml` },
                            { symbolId: `gml/script/${name}_b`, filePath: `scripts/${name}_b.gml` }
                        ];
                    }
                }
                return [];
            }
        };

        const graph = await computeRenameImpactGraph("gml/script/scr_root", semantic);

        // root (1) + level-1 (10) + level-2 (20) = 31 nodes total
        assert.equal(graph.totalAffectedSymbols, 31);
        assert.equal(graph.maxDepth, 2);
        assert.equal(graph.rootSymbol, "gml/script/scr_root");

        // All level-1 nodes should be in the graph at distance 1
        for (const l1Id of level1) {
            const node = graph.nodes.get(l1Id);
            assert.ok(node, `Level-1 node ${l1Id} should be present`);
            assert.equal(node.distance, 1);
        }

        // All level-2 nodes should be at distance 2
        for (const l2Entry of level2) {
            const node = graph.nodes.get(l2Entry.symbolId);
            assert.ok(node, `Level-2 node ${l2Entry.symbolId} should be present`);
            assert.equal(node.distance, 2);
        }
    });
});
