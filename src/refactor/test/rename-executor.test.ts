/**
 * Tests for standalone rename executor functions:
 * validateWorkspaceEdit, applyEditsToContent, applyWorkspaceEdits, validateTranspilerCompatibility.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyEditsToContent, applyWorkspaceEdits, validateWorkspaceEdit } from "../src/rename-executor.js";
import type { PartialSemanticAnalyzer } from "../src/types.js";
import { WorkspaceEdit } from "../src/workspace-edit.js";

void describe("validateWorkspaceEdit", () => {
    void it("rejects non-WorkspaceEdit input", async () => {
        const result = await validateWorkspaceEdit(null as never, null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Invalid workspace edit")));
    });

    void it("rejects empty workspace edit", async () => {
        const ws = new WorkspaceEdit();
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("no changes")));
    });

    void it("accepts workspace with text edits", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 10, 20, "newText");
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, true);
    });

    void it("accepts workspace with only metadata edits", async () => {
        const ws = new WorkspaceEdit();
        ws.addMetadataEdit("objects/o_player.yy", '{"name":"o_player"}');
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, true);
    });

    void it("detects overlapping edits in the same file", async () => {
        const ws = new WorkspaceEdit();
        // Both edits cover overlapping range (0-20 and 10-30)
        ws.addEdit("scripts/a.gml", 0, 20, "first");
        ws.addEdit("scripts/a.gml", 10, 30, "second");
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Overlapping")));
    });

    void it("warns when a single file has more than 50 edits", async () => {
        const ws = new WorkspaceEdit();
        for (let i = 0; i < 52; i++) {
            ws.addEdit("scripts/big.gml", i * 10, i * 10 + 5, `text${i}`);
        }
        const result = await validateWorkspaceEdit(ws, null);
        assert.ok(result.warnings.some((w) => w.includes("Large number of edits")));
    });

    void it("detects duplicate metadata edit for same path", async () => {
        const ws = new WorkspaceEdit();
        ws.addMetadataEdit("objects/o_player.yy", '{"a":1}');
        ws.addMetadataEdit("objects/o_player.yy", '{"a":2}');
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Duplicate metadata")));
    });

    void it("errors on combined text and metadata edits for same path", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 0, 5, "new");
        ws.addMetadataEdit("scripts/a.gml", "full-content");
        const result = await validateWorkspaceEdit(ws, null);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes("Cannot combine")));
    });

    void it("delegates to semantic validateEdits when available", async () => {
        const semantic: PartialSemanticAnalyzer = {
            validateEdits: async () => ({
                errors: ["semantic error from validator"],
                warnings: []
            })
        };

        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 0, 5, "new");
        const result = await validateWorkspaceEdit(ws, semantic);
        assert.ok(result.errors.some((e) => e.includes("semantic error")));
    });
});

void describe("applyEditsToContent", () => {
    void it("applies a single edit", () => {
        const result = applyEditsToContent("hello world", [{ start: 6, end: 11, newText: "there" }]);
        assert.equal(result, "hello there");
    });

    void it("applies multiple edits in descending order (end-of-file first preserves offsets)", () => {
        // Edits must be pre-sorted descending by start position (as returned by groupByFile).
        // Replacing from the end first keeps earlier offsets stable.
        // "abcde" → replace chars 3-5 (de) with "X" → "abcX"
        //           then replace chars 0-2 (ab) with "Y" → "YcX"
        const result = applyEditsToContent("abcde", [
            { start: 3, end: 5, newText: "X" },
            { start: 0, end: 2, newText: "Y" }
        ]);
        assert.equal(result, "YcX");
    });

    void it("handles empty content", () => {
        const result = applyEditsToContent("", [{ start: 0, end: 0, newText: "hello" }]);
        assert.equal(result, "hello");
    });

    void it("handles replacement with empty string (deletion)", () => {
        const result = applyEditsToContent("hello world", [{ start: 5, end: 11, newText: "" }]);
        assert.equal(result, "hello");
    });

    void it("returns original content unchanged when edits array is empty", () => {
        const original = "unchanged content";
        const result = applyEditsToContent(original, []);
        assert.equal(result, original);
    });
});

void describe("applyWorkspaceEdits", () => {
    void it("throws when workspace is not a WorkspaceEdit", async () => {
        await assert.rejects(
            () => applyWorkspaceEdits(null as never, { readFile: async () => "" }, null),
            /requires a WorkspaceEdit/
        );
    });

    void it("throws when readFile is missing", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 0, 5, "new");
        await assert.rejects(() => applyWorkspaceEdits(ws, {} as never, null), /readFile/);
    });

    void it("throws when writeFile is missing in non-dry-run mode", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 0, 5, "new");
        await assert.rejects(
            () => applyWorkspaceEdits(ws, { dryRun: false, readFile: async () => "old content" }, null),
            /writeFile/
        );
    });

    void it("returns modified content in dry-run mode without writing", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 6, 11, "there");

        const written = new Map<string, string>();
        const result = await applyWorkspaceEdits(
            ws,
            {
                dryRun: true,
                readFile: async () => "hello world",
                writeFile: async (p, c) => {
                    written.set(p, c);
                }
            },
            null
        );

        assert.equal(result.get("scripts/a.gml"), "hello there");
        assert.equal(written.size, 0);
    });

    void it("writes files when not in dry-run mode", async () => {
        const ws = new WorkspaceEdit();
        ws.addEdit("scripts/a.gml", 0, 5, "new");

        const written = new Map<string, string>();
        await applyWorkspaceEdits(
            ws,
            {
                dryRun: false,
                readFile: async () => "old content",
                writeFile: async (p, c) => {
                    written.set(p, c);
                }
            },
            null
        );

        assert.ok(written.has("scripts/a.gml"));
    });

    void it("processes metadata edits", async () => {
        const ws = new WorkspaceEdit();
        ws.addMetadataEdit("objects/o_player.yy", '{"name":"o_player_new"}');

        const written = new Map<string, string>();
        const result = await applyWorkspaceEdits(
            ws,
            {
                dryRun: false,
                readFile: async () => "",
                writeFile: async (p, c) => {
                    written.set(p, c);
                }
            },
            null
        );

        assert.equal(result.get("objects/o_player.yy"), '{"name":"o_player_new"}');
        assert.equal(written.get("objects/o_player.yy"), '{"name":"o_player_new"}');
    });
});
