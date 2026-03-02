/**
 * Tests for the standalone rename planner (buildRenameWorkspace).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRenameWorkspace } from "../src/rename-planner.js";
import { SemanticQueryCache } from "../src/semantic-cache.js";
import type { PartialSemanticAnalyzer, SymbolOccurrence } from "../src/types.js";
import { WorkspaceEdit } from "../src/workspace-edit.js";

void describe("buildRenameWorkspace", () => {
    void it("throws when symbolId is missing", async () => {
        const cache = new SemanticQueryCache(null);
        await assert.rejects(
            () => buildRenameWorkspace({ newName: "scr_bar" } as never, null, cache),
            /requires symbolId and newName/
        );
    });

    void it("throws when newName is an invalid identifier", async () => {
        const cache = new SemanticQueryCache(null);
        await assert.rejects(
            () => buildRenameWorkspace({ symbolId: "gml/script/scr_foo", newName: "1invalid" }, null, cache),
            /identifier/i
        );
    });

    void it("throws when symbol does not exist in semantic index", async () => {
        const semantic: PartialSemanticAnalyzer = { hasSymbol: async () => false };
        const cache = new SemanticQueryCache(semantic);

        await assert.rejects(
            () => buildRenameWorkspace({ symbolId: "gml/script/scr_ghost", newName: "scr_new" }, semantic, cache),
            /not found in semantic index/
        );
    });

    void it("throws when new name matches existing name", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        await assert.rejects(
            () => buildRenameWorkspace({ symbolId: "gml/script/scr_foo", newName: "scr_foo" }, semantic, cache),
            /matches the existing/
        );
    });

    void it("produces workspace with one edit per occurrence", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "scripts/a.gml", start: 0, end: 7 },
            { path: "scripts/b.gml", start: 10, end: 17 }
        ];

        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => occurrences,
            getReservedKeywords: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const workspace = await buildRenameWorkspace(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.equal(workspace.edits.length, 2);
        assert.ok(workspace.edits.every((e) => e.newText === "scr_bar"));
    });

    void it("produces empty workspace when symbol has no occurrences", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => [],
            getReservedKeywords: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const workspace = await buildRenameWorkspace(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.equal(workspace.edits.length, 0);
    });

    void it("includes additional edits from semantic analyzer (file renames, metadata)", async () => {
        const additionalWs = new WorkspaceEdit();
        additionalWs.addEdit("scripts/foo.gml", 100, 110, "scr_bar");
        additionalWs.addFileRename("scripts/scr_foo.gml", "scripts/scr_bar.gml");
        additionalWs.addMetadataEdit("objects/o_foo.yy", '{"name":"o_bar"}');

        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => [{ path: "scripts/foo.gml", start: 0, end: 7 }],
            getReservedKeywords: async () => [],
            getAdditionalSymbolEdits: async () => additionalWs
        };
        const cache = new SemanticQueryCache(semantic);

        const workspace = await buildRenameWorkspace(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.equal(workspace.edits.length, 2); // 1 occurrence + 1 additional
        assert.equal(workspace.fileRenames.length, 1);
        assert.equal(workspace.metadataEdits.length, 1);
    });

    void it("throws when semantic analyzer is not provided (required for existence check)", async () => {
        const cache = new SemanticQueryCache(null);

        // validateSymbolExists requires a semantic analyzer and throws without one.
        await assert.rejects(
            () => buildRenameWorkspace({ symbolId: "gml/script/scr_foo", newName: "scr_bar" }, null, cache),
            /semantic analyzer/i
        );
    });
});
