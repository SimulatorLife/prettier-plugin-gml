/**
 * Tests for dependency tracker module.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DependencyTracker } from "../src/modules/dependency-tracker.js";

describe("DependencyTracker", () => {
    describe("registerFileDefines", () => {
        it("should register symbols defined by a file", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move", "gml_Script_player_jump"]);

            const defs = tracker.getFileDefinitions("scripts/player.gml");
            assert.deepEqual(defs.sort(), ["gml_Script_player_jump", "gml_Script_player_move"]);
        });

        it("should update symbol-to-file mapping", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);

            const snapshot = tracker.getSnapshot();
            assert.equal(snapshot.symbolToDefFile.get("gml_Script_player_move"), "scripts/player.gml");
        });

        it("should accumulate definitions for multiple calls on same file", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_jump"]);

            const defs = tracker.getFileDefinitions("scripts/player.gml");
            assert.equal(defs.length, 2);
            assert.ok(defs.includes("gml_Script_player_move"));
            assert.ok(defs.includes("gml_Script_player_jump"));
        });
    });

    describe("registerFileReferences", () => {
        it("should register symbols referenced by a file", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);

            const refs = tracker.getFileReferences("scripts/enemy.gml");
            assert.deepEqual(refs, ["gml_Script_player_move"]);
        });

        it("should update symbol-to-referencing-files mapping", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);

            const snapshot = tracker.getSnapshot();
            const refFiles = snapshot.symbolToRefFiles.get("gml_Script_player_move");
            assert.ok(refFiles);
            assert.ok(refFiles.has("scripts/enemy.gml"));
        });

        it("should track multiple files referencing same symbol", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/boss.gml", ["gml_Script_player_move"]);

            const snapshot = tracker.getSnapshot();
            const refFiles = snapshot.symbolToRefFiles.get("gml_Script_player_move");
            assert.ok(refFiles);
            assert.equal(refFiles.size, 2);
            assert.ok(refFiles.has("scripts/enemy.gml"));
            assert.ok(refFiles.has("scripts/boss.gml"));
        });
    });

    describe("getDependentFiles", () => {
        it("should return files that reference symbols defined in the changed file", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);

            const dependents = tracker.getDependentFiles("scripts/player.gml");
            assert.deepEqual(dependents, ["scripts/enemy.gml"]);
        });

        it("should return multiple dependent files", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/boss.gml", ["gml_Script_player_move"]);

            const dependents = tracker.getDependentFiles("scripts/player.gml");
            assert.equal(dependents.length, 2);
            assert.ok(dependents.includes("scripts/enemy.gml"));
            assert.ok(dependents.includes("scripts/boss.gml"));
        });

        it("should return dependents for files defining multiple symbols", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move", "gml_Script_player_jump"]);
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/boss.gml", ["gml_Script_player_jump"]);

            const dependents = tracker.getDependentFiles("scripts/player.gml");
            assert.equal(dependents.length, 2);
            assert.ok(dependents.includes("scripts/enemy.gml"));
            assert.ok(dependents.includes("scripts/boss.gml"));
        });

        it("should return empty array for file with no dependencies", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);

            const dependents = tracker.getDependentFiles("scripts/player.gml");
            assert.deepEqual(dependents, []);
        });

        it("should return empty array for unknown file", () => {
            const tracker = new DependencyTracker();
            const dependents = tracker.getDependentFiles("scripts/unknown.gml");
            assert.deepEqual(dependents, []);
        });

        it("should not include the file itself in dependents", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/player.gml", ["gml_Script_player_move"]);

            const dependents = tracker.getDependentFiles("scripts/player.gml");
            assert.deepEqual(dependents, []);
        });
    });

    describe("removeFile", () => {
        it("should remove file definitions", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.removeFile("scripts/player.gml");

            const defs = tracker.getFileDefinitions("scripts/player.gml");
            assert.deepEqual(defs, []);
        });

        it("should remove file references", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
            tracker.removeFile("scripts/enemy.gml");

            const refs = tracker.getFileReferences("scripts/enemy.gml");
            assert.deepEqual(refs, []);
        });

        it("should update symbol-to-file mappings when removing definitions", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.removeFile("scripts/player.gml");

            const snapshot = tracker.getSnapshot();
            assert.equal(snapshot.symbolToDefFile.has("gml_Script_player_move"), false);
        });

        it("should update symbol-to-referencing-files when removing references", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
            tracker.removeFile("scripts/enemy.gml");

            const snapshot = tracker.getSnapshot();
            const refFiles = snapshot.symbolToRefFiles.get("gml_Script_player_move");
            assert.equal(refFiles, undefined);
        });

        it("should handle removing non-existent file gracefully", () => {
            const tracker = new DependencyTracker();
            assert.doesNotThrow(() => {
                tracker.removeFile("scripts/nonexistent.gml");
            });
        });
    });

    describe("clear", () => {
        it("should clear all tracking data", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);

            tracker.clear();

            const snapshot = tracker.getSnapshot();
            assert.equal(snapshot.fileToDefs.size, 0);
            assert.equal(snapshot.fileToRefs.size, 0);
            assert.equal(snapshot.symbolToDefFile.size, 0);
            assert.equal(snapshot.symbolToRefFiles.size, 0);
        });
    });

    describe("getSnapshot", () => {
        it("should return a copy of the dependency graph", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);

            const snapshot = tracker.getSnapshot();
            assert.ok(snapshot.fileToDefs.has("scripts/player.gml"));

            tracker.clear();
            assert.ok(snapshot.fileToDefs.has("scripts/player.gml"));
        });
    });

    describe("getStatistics", () => {
        it("should return zero statistics for empty tracker", () => {
            const tracker = new DependencyTracker();
            const stats = tracker.getStatistics();

            assert.equal(stats.totalFiles, 0);
            assert.equal(stats.totalSymbols, 0);
            assert.equal(stats.filesWithDefs, 0);
            assert.equal(stats.filesWithRefs, 0);
            assert.equal(stats.averageDefsPerFile, 0);
            assert.equal(stats.averageRefsPerFile, 0);
        });

        it("should calculate correct statistics", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move", "gml_Script_player_jump"]);
            tracker.registerFileDefines("scripts/enemy.gml", ["gml_Script_enemy_move"]);
            tracker.registerFileReferences("scripts/boss.gml", ["gml_Script_player_move"]);

            const stats = tracker.getStatistics();

            assert.equal(stats.totalFiles, 3);
            assert.equal(stats.totalSymbols, 3);
            assert.equal(stats.filesWithDefs, 2);
            assert.equal(stats.filesWithRefs, 1);
            assert.equal(stats.averageDefsPerFile, 1.5);
            assert.equal(stats.averageRefsPerFile, 1);
        });
    });

    describe("complex dependency scenarios", () => {
        it("should handle circular dependencies", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/a.gml", ["gml_Script_a"]);
            tracker.registerFileReferences("scripts/a.gml", ["gml_Script_b"]);
            tracker.registerFileDefines("scripts/b.gml", ["gml_Script_b"]);
            tracker.registerFileReferences("scripts/b.gml", ["gml_Script_a"]);

            const aDependents = tracker.getDependentFiles("scripts/a.gml");
            const bDependents = tracker.getDependentFiles("scripts/b.gml");

            assert.deepEqual(aDependents, ["scripts/b.gml"]);
            assert.deepEqual(bDependents, ["scripts/a.gml"]);
        });

        it("should handle transitive dependencies correctly", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/utils.gml", ["gml_Script_util_func"]);
            tracker.registerFileReferences("scripts/player.gml", ["gml_Script_util_func"]);
            tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move"]);
            tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);

            const utilsDependents = tracker.getDependentFiles("scripts/utils.gml");
            assert.deepEqual(utilsDependents, ["scripts/player.gml"]);

            const playerDependents = tracker.getDependentFiles("scripts/player.gml");
            assert.deepEqual(playerDependents, ["scripts/enemy.gml"]);
        });

        it("should handle file redefining symbols", () => {
            const tracker = new DependencyTracker();
            tracker.registerFileDefines("scripts/old.gml", ["gml_Script_func"]);
            tracker.registerFileReferences("scripts/consumer.gml", ["gml_Script_func"]);

            // Remove old file - this clears the symbol definition
            tracker.removeFile("scripts/old.gml");

            // Register new file with same symbol
            tracker.registerFileDefines("scripts/new.gml", ["gml_Script_func"]);

            // The consumer still has its reference, so new definition finds it
            const newDependents = tracker.getDependentFiles("scripts/new.gml");
            assert.deepEqual(newDependents, ["scripts/consumer.gml"]);
        });
    });
});
