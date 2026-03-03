import assert from "node:assert/strict";
import test from "node:test";

import { Refactor } from "../index.js";

const { runCodemod } = Refactor;
const { applyLoopLengthHoistingCodemod } = Refactor.LoopLengthHoisting;

void test("runCodemod applies transform to files that need changes", () => {
    const input = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const files = [
        { path: "scripts/scr_a.gml", content: input },
        { path: "scripts/scr_b.gml", content: "var x = 1;\n" }
    ];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 2);
    assert.equal(result.changedFiles.length, 1);
    assert.equal(result.changedFiles[0], "scripts/scr_a.gml");
    assert.equal(result.workspace.edits.length, 1);
    assert.equal(result.workspace.edits[0].path, "scripts/scr_a.gml");
    assert.equal(result.workspace.edits[0].start, 0);
    assert.equal(result.workspace.edits[0].end, input.length);
    assert.ok(result.workspace.edits[0].newText.includes("var len ="));
});

void test("runCodemod returns empty workspace when no files change", () => {
    const files = [{ path: "scripts/scr_a.gml", content: "var x = 1;\n" }];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 1);
    assert.equal(result.changedFiles.length, 0);
    assert.equal(result.workspace.edits.length, 0);
});

void test("runCodemod processes an empty file list", () => {
    const result = runCodemod([], applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 0);
    assert.equal(result.changedFiles.length, 0);
    assert.equal(result.workspace.edits.length, 0);
});

void test("runCodemod throws TypeError on non-array files argument", () => {
    assert.throws(
        () =>
            runCodemod(null as unknown as Array<{ path: string; content: string }>, applyLoopLengthHoistingCodemod, {}),
        TypeError
    );
});

void test("runCodemod throws TypeError on non-function transform", () => {
    assert.throws(() => runCodemod([], null as unknown as typeof applyLoopLengthHoistingCodemod, {}), TypeError);
});

void test("runCodemod skips files with an empty path", () => {
    const files = [{ path: "", content: "for (var i = 0; i < array_length(items); i++) {}\n" }];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 1);
    assert.equal(result.changedFiles.length, 0);
    assert.equal(result.workspace.edits.length, 0);
});

void test("runCodemod skips files where content is not a string", () => {
    const files = [{ path: "scripts/scr_a.gml", content: null as unknown as string }];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 1);
    assert.equal(result.changedFiles.length, 0);
    assert.equal(result.workspace.edits.length, 0);
});

void test("runCodemod accumulates changes from multiple files", () => {
    const input = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const files = [
        { path: "scripts/scr_a.gml", content: input },
        { path: "scripts/scr_b.gml", content: input }
    ];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.totalFilesProcessed, 2);
    assert.equal(result.changedFiles.length, 2);
    assert.equal(result.workspace.edits.length, 2);

    const paths = new Set(result.workspace.edits.map((e) => e.path));
    assert.ok(paths.has("scripts/scr_a.gml"));
    assert.ok(paths.has("scripts/scr_b.gml"));
});

void test("runCodemod workspace edit replaces full file content", () => {
    const content = "for (var i = 0; i < array_length(items); i++) {}\n";
    const files = [{ path: "f.gml", content }];

    const result = runCodemod(files, applyLoopLengthHoistingCodemod, {});

    assert.equal(result.workspace.edits.length, 1);
    const edit = result.workspace.edits[0];
    assert.equal(edit.start, 0);
    assert.equal(edit.end, content.length);
    // Applying the edit should produce the transformed text
    const applied = content.slice(0, edit.start) + edit.newText + content.slice(edit.end);
    assert.ok(applied.includes("var len ="), "applied edit should include hoisted var");
});
