/**
 * Tests for standalone rename impact analysis and post-edit integrity functions.
 * These functions are extracted from RefactorEngine to keep computation domain-focused.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeRenameImpact, verifyPostEditIntegrity } from "../src/impact-analysis.js";
import { SemanticQueryCache } from "../src/semantic-cache.js";
import {
    type DependentSymbol,
    OccurrenceKind,
    type PartialSemanticAnalyzer,
    type SymbolOccurrence
} from "../src/types.js";
import { WorkspaceEdit } from "../src/workspace-edit.js";

void describe("analyzeRenameImpact", () => {
    void it("throws on invalid request (missing symbolId)", async () => {
        const cache = new SemanticQueryCache(null);
        await assert.rejects(
            () => analyzeRenameImpact({ newName: "scr_new" } as never, null, cache),
            /requires symbolId and newName/
        );
    });

    void it("returns missing-symbol conflict when symbol does not exist", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => false
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await analyzeRenameImpact(
            { symbolId: "gml/script/scr_ghost", newName: "scr_new" },
            semantic,
            cache
        );

        assert.equal(result.valid, false);
        assert.equal(result.conflicts.length, 1);
        assert.equal(result.conflicts[0].type, "missing_symbol");
    });

    void it("returns analysis-error conflict when semantic is null (cannot validate symbol)", async () => {
        const cache = new SemanticQueryCache(null);

        const result = await analyzeRenameImpact({ symbolId: "gml/script/scr_foo", newName: "scr_bar" }, null, cache);

        // Without a semantic analyzer validateSymbolExists throws, caught as ANALYSIS_ERROR.
        assert.equal(result.valid, false);
        assert.ok(result.conflicts.some((c) => c.type === "analysis_error"));
    });

    void it("counts definitions and references separately", async () => {
        const occurrences: Array<SymbolOccurrence> = [
            { path: "scripts/a.gml", start: 0, end: 7, kind: OccurrenceKind.DEFINITION },
            { path: "scripts/b.gml", start: 10, end: 17, kind: OccurrenceKind.REFERENCE },
            { path: "scripts/c.gml", start: 5, end: 12, kind: OccurrenceKind.REFERENCE }
        ];

        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => occurrences,
            getReservedKeywords: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await analyzeRenameImpact(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.equal(result.valid, true);
        assert.equal(result.summary.totalOccurrences, 3);
        assert.equal(result.summary.definitionCount, 1);
        assert.equal(result.summary.referenceCount, 2);
        assert.equal(result.summary.hotReloadRequired, true);
        assert.equal(result.summary.affectedFiles.length, 3);
    });

    void it("collects dependent symbols from semantic analyzer", async () => {
        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => [{ path: "scripts/a.gml", start: 0, end: 7 }],
            getDependents: async (): Promise<Array<DependentSymbol>> => [
                { symbolId: "gml/script/scr_other", filePath: "scripts/other.gml" }
            ],
            getReservedKeywords: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await analyzeRenameImpact(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.equal(result.valid, true);
        assert.deepEqual(result.summary.dependentSymbols, ["gml/script/scr_other"]);
    });

    void it("emits large-rename warning when occurrences exceed 50", async () => {
        const manyOccurrences: Array<SymbolOccurrence> = Array.from({ length: 55 }, (_, i) => ({
            path: `scripts/file${i}.gml`,
            start: 0,
            end: 7
        }));

        const semantic: PartialSemanticAnalyzer = {
            hasSymbol: async () => true,
            getSymbolOccurrences: async () => manyOccurrences,
            getReservedKeywords: async () => []
        };
        const cache = new SemanticQueryCache(semantic);

        const result = await analyzeRenameImpact(
            { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
            semantic,
            cache
        );

        assert.ok(
            result.warnings.some((w) => w.type === "large_rename"),
            "Expected large_rename warning"
        );
    });
});

void describe("verifyPostEditIntegrity", () => {
    void it("returns error for invalid symbolId", async () => {
        const ws = new WorkspaceEdit();
        const result = await verifyPostEditIntegrity(
            { symbolId: "", oldName: "foo", newName: "bar", workspace: ws, readFile: async () => "" },
            null,
            null
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("symbolId")));
    });

    void it("returns error for invalid workspace", async () => {
        const result = await verifyPostEditIntegrity(
            {
                symbolId: "gml/script/scr_foo",
                oldName: "scr_foo",
                newName: "scr_bar",
                workspace: null as never,
                readFile: async () => ""
            },
            null,
            null
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("workspace")));
    });

    void it("returns error when old name still present as non-comment token", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/player.gml", 0, 10, "scr_hero");

        const result = await verifyPostEditIntegrity(
            {
                symbolId: "gml/script/scr_player",
                oldName: "scr_player",
                newName: "scr_hero",
                workspace: ws,
                readFile: async () => "scr_player();"
            },
            null,
            null
        );

        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("scr_player")));
    });

    void it("returns warning when old name only appears in comments", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/player.gml", 0, 10, "scr_hero");

        const result = await verifyPostEditIntegrity(
            {
                symbolId: "gml/script/scr_player",
                oldName: "scr_player",
                newName: "scr_hero",
                workspace: ws,
                readFile: async () => "// scr_player\nscr_hero();"
            },
            null,
            null
        );

        assert.equal(result.valid, true);
        assert.ok(result.warnings.some((w) => w.includes("comment")));
    });

    void it("returns valid when new name is present and old name is absent", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/player.gml", 0, 10, "scr_hero");

        const result = await verifyPostEditIntegrity(
            {
                symbolId: "gml/script/scr_player",
                oldName: "scr_player",
                newName: "scr_hero",
                workspace: ws,
                readFile: async () => "scr_hero();"
            },
            null,
            null
        );

        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
    });

    void it("warns when no semantic analyzer is available", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/player.gml", 0, 10, "scr_hero");

        const result = await verifyPostEditIntegrity(
            {
                symbolId: "gml/script/scr_player",
                oldName: "scr_player",
                newName: "scr_hero",
                workspace: ws,
                readFile: async () => "scr_hero();"
            },
            null,
            null
        );

        assert.ok(result.warnings.some((w) => /semantic analyzer/i.test(w)));
    });
});
