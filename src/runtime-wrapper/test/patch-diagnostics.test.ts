import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Runtime } from "../src/index.js";

void describe("getPatchDiagnostics", () => {
    void it("returns null for non-existent patch ID", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        const diagnostics = wrapper.getPatchDiagnostics("script:nonexistent");
        assert.strictEqual(diagnostics, null);
    });

    void it("returns diagnostics for applied patch", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 42;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.id, "script:test");
        assert.strictEqual(diagnostics.kind, "script");
        assert.strictEqual(diagnostics.applicationCount, 1);
        assert.strictEqual(diagnostics.currentlyApplied, true);
        assert.strictEqual(diagnostics.undoCount, 0);
        assert.strictEqual(diagnostics.rollbackCount, 0);
    });

    void it("tracks patch metadata", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        const metadata = {
            sourcePath: "/path/to/script.gml",
            sourceHash: "abc123",
            timestamp: Date.now(),
            dependencies: ["script:other"]
        };

        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 42;",
            metadata
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.sourcePath, metadata.sourcePath);
        assert.strictEqual(diagnostics.sourceHash, metadata.sourceHash);
        assert.deepStrictEqual(diagnostics.dependencies, metadata.dependencies);
    });

    void it("tracks multiple applications of same patch", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 1;"
        });
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 2;"
        });
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 3;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.applicationCount, 3);
        assert.strictEqual(diagnostics.currentlyApplied, true);
        assert.ok(diagnostics.firstAppliedAt !== null);
        assert.ok(diagnostics.lastAppliedAt !== null);
        assert.ok(diagnostics.firstAppliedAt <= diagnostics.lastAppliedAt);
    });

    void it("tracks undo operations", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 42;"
        });
        wrapper.undo();

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.applicationCount, 1);
        assert.strictEqual(diagnostics.undoCount, 1);
        assert.strictEqual(diagnostics.currentlyApplied, false);
    });

    void it("tracks rollback operations", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        const result = wrapper.trySafeApply({
            kind: "script",
            id: "script:bad",
            js_body: "return {{ invalid syntax"
        });

        assert.strictEqual(result.success, false);

        const diagnostics = wrapper.getPatchDiagnostics("script:bad");
        // Shadow validation failures don't create history entries
        assert.strictEqual(diagnostics, null);
    });

    void it("calculates average duration", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 1;"
        });
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 2;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.ok(diagnostics.averageDurationMs !== null);
        assert.ok(diagnostics.averageDurationMs >= 0);
    });

    void it("includes full history entries", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 1;"
        });
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 2;"
        });
        wrapper.undo();

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.historyEntries.length, 3);
        assert.strictEqual(diagnostics.historyEntries[0].action, "apply");
        assert.strictEqual(diagnostics.historyEntries[1].action, "apply");
        assert.strictEqual(diagnostics.historyEntries[2].action, "undo");
    });

    void it("handles event patches", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "event",
            id: "obj_player#Step",
            js_body: "this.x += 1;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("obj_player#Step");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.kind, "event");
        assert.strictEqual(diagnostics.currentlyApplied, true);
    });

    void it("handles closure patches", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "closure",
            id: "closure:counter",
            js_body: "let n = 0; return () => ++n;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("closure:counter");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.kind, "closure");
        assert.strictEqual(diagnostics.currentlyApplied, true);
    });

    void it("returns null dependencies when metadata not provided", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 42;"
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        assert.strictEqual(diagnostics.sourcePath, null);
        assert.strictEqual(diagnostics.sourceHash, null);
        assert.deepStrictEqual(diagnostics.dependencies, []);
    });

    void it("handles mixed metadata across re-applications", () => {
        const wrapper = Runtime.createRuntimeWrapper();
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 1;"
        });
        wrapper.applyPatch({
            kind: "script",
            id: "script:test",
            js_body: "return 2;",
            metadata: {
                sourcePath: "/path/to/updated.gml",
                sourceHash: "xyz789"
            }
        });

        const diagnostics = wrapper.getPatchDiagnostics("script:test");
        assert.ok(diagnostics !== null);
        // Should use metadata from the first entry that has it
        assert.strictEqual(diagnostics.sourcePath, "/path/to/updated.gml");
        assert.strictEqual(diagnostics.sourceHash, "xyz789");
    });
});
