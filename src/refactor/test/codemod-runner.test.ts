/**
 * Tests for the project-wide codemod runner.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCodemodAcrossFiles, type SingleFileCodemod } from "../src/codemods/codemod-runner.js";
import { applyLoopLengthHoistingCodemod } from "../src/codemods/loop-length-hoisting/index.js";

/** Identity codemod: returns the source unchanged. */
const identityCodemod: SingleFileCodemod = (sourceText) => ({ changed: false, outputText: sourceText });

/** A codemod that appends a comment to every file. */
const appendCommentCodemod: SingleFileCodemod = (sourceText) => ({
    changed: true,
    outputText: `${sourceText}// codemod applied\n`
});

/** A codemod that throws when the source contains the word "BANG". */
const burstingCodemod: SingleFileCodemod = (src) => {
    if (src.includes("BANG")) throw new Error("codemod exploded");
    return { changed: false, outputText: src };
};

/** Minimal async file reader that always returns an empty string; used in validation tests. */
async function emptyReader(): Promise<string> {
    return "";
}

void describe("runCodemodAcrossFiles", () => {
    void describe("empty input", () => {
        void it("returns empty result for empty file list", async () => {
            const result = await runCodemodAcrossFiles([], identityCodemod, async () => "");

            assert.equal(result.summary.total, 0);
            assert.equal(result.summary.changed, 0);
            assert.equal(result.summary.skipped, 0);
            assert.equal(result.summary.failed, 0);
            assert.equal(result.workspace.edits.length, 0);
            assert.equal(result.changedFiles.length, 0);
            assert.equal(result.skippedFiles.length, 0);
            assert.equal(result.errors.size, 0);
        });
    });

    void describe("single file – changed", () => {
        void it("produces a workspace edit covering the entire file when codemod changes source", async () => {
            const input = "for (var i = 0; i < array_length(items); i++) {}\n";
            const files = new Map([["scr_test.gml", input]]);

            const result = await runCodemodAcrossFiles(
                ["scr_test.gml"],
                applyLoopLengthHoistingCodemod,
                async (path) => files.get(path) ?? ""
            );

            assert.equal(result.summary.total, 1);
            assert.equal(result.summary.changed, 1);
            assert.equal(result.summary.skipped, 0);
            assert.equal(result.summary.failed, 0);
            assert.equal(result.changedFiles.length, 1);
            assert.equal(result.changedFiles[0], "scr_test.gml");
            assert.equal(result.skippedFiles.length, 0);
            assert.equal(result.errors.size, 0);

            assert.equal(result.workspace.edits.length, 1);
            const edit = result.workspace.edits[0];
            assert.equal(edit.path, "scr_test.gml");
            assert.equal(edit.start, 0);
            assert.equal(edit.end, input.length);
            assert.ok(
                edit.newText.includes("var len = array_length(items);"),
                `expected hoisted variable in output, got:\n${edit.newText}`
            );
        });
    });

    void describe("single file – unchanged", () => {
        void it("records unchanged file in skippedFiles without adding workspace edits", async () => {
            const source = "var x = 1;\n";

            const result = await runCodemodAcrossFiles(
                ["plain.gml"],
                applyLoopLengthHoistingCodemod,
                async () => source
            );

            assert.equal(result.summary.total, 1);
            assert.equal(result.summary.changed, 0);
            assert.equal(result.summary.skipped, 1);
            assert.equal(result.summary.failed, 0);
            assert.equal(result.skippedFiles.length, 1);
            assert.equal(result.skippedFiles[0], "plain.gml");
            assert.equal(result.workspace.edits.length, 0);
        });
    });

    void describe("error handling", () => {
        void it("records read error and continues processing remaining files", async () => {
            const result = await runCodemodAcrossFiles(["missing.gml", "valid.gml"], identityCodemod, async (path) => {
                if (path === "missing.gml") throw new Error("ENOENT: file not found");
                return "var x = 1;\n";
            });

            assert.equal(result.summary.total, 2);
            assert.equal(result.summary.failed, 1);
            assert.equal(result.summary.skipped, 1);
            assert.equal(result.errors.size, 1);
            assert.ok(result.errors.has("missing.gml"));
            assert.ok((result.errors.get("missing.gml") ?? "").includes("ENOENT"));
        });

        void it("records codemod exception and continues processing remaining files", async () => {
            const result = await runCodemodAcrossFiles(["boom.gml", "ok.gml"], burstingCodemod, async (path) =>
                path === "boom.gml" ? "BANG" : "safe"
            );

            assert.equal(result.summary.total, 2);
            assert.equal(result.summary.failed, 1);
            assert.equal(result.summary.skipped, 1);
            assert.ok(result.errors.has("boom.gml"));
            assert.ok((result.errors.get("boom.gml") ?? "").includes("exploded"));
            assert.ok(result.skippedFiles.includes("ok.gml"));
        });
    });

    void describe("multiple files", () => {
        void it("processes all files and correctly separates changed, skipped, and failed", async () => {
            const loopSource = "for (var i = 0; i < array_length(items); i++) {}\n";
            const plainSource = "var x = 1;\n";
            const files = new Map([
                ["loop.gml", loopSource],
                ["plain.gml", plainSource],
                ["loop2.gml", loopSource]
            ]);

            const result = await runCodemodAcrossFiles(
                ["loop.gml", "plain.gml", "loop2.gml"],
                applyLoopLengthHoistingCodemod,
                async (path) => files.get(path) ?? ""
            );

            assert.equal(result.summary.total, 3);
            assert.equal(result.summary.changed, 2);
            assert.equal(result.summary.skipped, 1);
            assert.equal(result.summary.failed, 0);
            assert.equal(result.changedFiles.length, 2);
            assert.ok(result.changedFiles.includes("loop.gml"));
            assert.ok(result.changedFiles.includes("loop2.gml"));
            assert.equal(result.skippedFiles.length, 1);
            assert.ok(result.skippedFiles.includes("plain.gml"));
            assert.equal(result.workspace.edits.length, 2);
        });

        void it("includes a workspace edit with correct start/end for each changed file", async () => {
            const aContent = "var a = 1;\n";
            const bContent = "for (var i = 0; i < array_length(xs); i++) {}\n";
            const files = new Map([
                ["a.gml", aContent],
                ["b.gml", bContent]
            ]);

            const result = await runCodemodAcrossFiles(
                ["a.gml", "b.gml"],
                applyLoopLengthHoistingCodemod,
                async (path) => files.get(path) ?? ""
            );

            assert.equal(result.workspace.edits.length, 1);
            const edit = result.workspace.edits[0];
            assert.equal(edit.path, "b.gml");
            assert.equal(edit.start, 0);
            assert.equal(edit.end, bContent.length);
        });

        void it("applies changes across all files when appendCommentCodemod is used", async () => {
            const sources = new Map([
                ["one.gml", "var x = 1;\n"],
                ["two.gml", "var y = 2;\n"]
            ]);

            const result = await runCodemodAcrossFiles(
                Array.from(sources.keys()),
                appendCommentCodemod,
                async (path) => sources.get(path) ?? ""
            );

            assert.equal(result.summary.changed, 2);
            assert.equal(result.workspace.edits.length, 2);
            for (const edit of result.workspace.edits) {
                assert.ok(edit.newText.endsWith("// codemod applied\n"));
            }
        });
    });

    void describe("workspace edit integration", () => {
        void it("produced workspace edit can be applied to reconstruct changed file contents", async () => {
            const original = "for (var i = 0; i < array_length(items); i++) {}\n";
            const result = await runCodemodAcrossFiles(
                ["scr.gml"],
                applyLoopLengthHoistingCodemod,
                async () => original
            );

            assert.equal(result.workspace.edits.length, 1);
            const edit = result.workspace.edits[0];
            // Simulate applyWorkspaceEdit: slice + newText + slice
            const applied = original.slice(0, edit.start) + edit.newText + original.slice(edit.end);
            assert.ok(applied.includes("var len = array_length(items);"));
            assert.ok(applied.includes("for (var i = 0; i < len; i++)"));
        });
    });

    void describe("input validation", () => {
        void it("throws TypeError when filePaths is not an array", async () => {
            await assert.rejects(
                () => runCodemodAcrossFiles(null as unknown as Array<string>, identityCodemod, emptyReader),
                TypeError
            );
        });

        void it("throws TypeError when codemod is not a function", async () => {
            await assert.rejects(
                () => runCodemodAcrossFiles([], null as unknown as SingleFileCodemod, emptyReader),
                TypeError
            );
        });

        void it("throws TypeError when readFile is not a function", async () => {
            await assert.rejects(
                () => runCodemodAcrossFiles([], identityCodemod, null as unknown as (path: string) => Promise<string>),
                TypeError
            );
        });
    });
});
