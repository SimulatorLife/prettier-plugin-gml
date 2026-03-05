import assert from "node:assert/strict";
import test from "node:test";

import { type LoopLengthHoistingCodemodOptions, Refactor } from "../index.js";

const { runCodemodAcrossFiles } = Refactor.CodemodRunner;
const { applyLoopLengthHoistingCodemod } = Refactor.LoopLengthHoisting;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Synchronous in-memory readFile stub. */
function makeReadFile(files: Record<string, string>): (path: string) => Promise<string> {
    return async (path: string) => {
        const content = files[path];
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    };
}

/** Adapter that wraps the two-arg loop-length codemod into a SingleFileCodemod signature. */
function loopLengthCodemod(sourceText: string, _filePath: string, options: LoopLengthHoistingCodemodOptions) {
    return applyLoopLengthHoistingCodemod(sourceText, options);
}

/** A codemod that always throws to simulate a runtime failure. */
function alwaysThrowingCodemod(_sourceText: string, _filePath: string, _options: unknown): never {
    throw new Error("Simulated codemod failure");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void test("runCodemodAcrossFiles returns empty workspace when no files change", async () => {
    const files = {
        "scripts/a.gml": "var x = 1;\n",
        "scripts/b.gml": "show_debug_message(x);\n"
    };
    const { workspace, summary } = await runCodemodAcrossFiles(
        Object.keys(files),
        loopLengthCodemod,
        makeReadFile(files),
        { codemodOptions: {} }
    );

    assert.equal(workspace.edits.length, 0);
    assert.equal(summary.changedFiles, 0);
    assert.equal(summary.processedFiles, 2);
    assert.equal(summary.skippedFiles, 0);
    assert.equal(summary.errors.size, 0);
});

void test("runCodemodAcrossFiles records edits for each changed file", async () => {
    const loopSource = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const plainSource = "var x = 1;\n";

    const files = {
        "scripts/loop.gml": loopSource,
        "scripts/plain.gml": plainSource
    };

    const { workspace, summary, results } = await runCodemodAcrossFiles(
        Object.keys(files),
        loopLengthCodemod,
        makeReadFile(files),
        { codemodOptions: {} }
    );

    assert.equal(summary.changedFiles, 1);
    assert.equal(summary.processedFiles, 2);
    assert.equal(summary.skippedFiles, 0);
    assert.equal(summary.errors.size, 0);

    // The workspace should have exactly one edit covering the changed file.
    assert.equal(workspace.edits.length, 1);
    assert.equal(workspace.edits[0].path, "scripts/loop.gml");
    assert.equal(workspace.edits[0].start, 0);
    assert.equal(workspace.edits[0].end, loopSource.length);

    // The result for the unchanged file should reflect no change.
    assert.equal(results.get("scripts/plain.gml").changed, false);
    assert.equal(results.get("scripts/loop.gml").changed, true);
});

void test("runCodemodAcrossFiles writes changed files when writeFile is provided", async () => {
    const loopSource = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const files = { "a.gml": loopSource };
    const written = new Map<string, string>();

    const { summary } = await runCodemodAcrossFiles(Object.keys(files), loopLengthCodemod, makeReadFile(files), {
        codemodOptions: {},
        writeFile: async (path, content) => {
            written.set(path, content);
        }
    });

    assert.equal(summary.changedFiles, 1);
    assert.equal(written.size, 1);
    assert.equal(written.has("a.gml"), true);
    // The written content must contain the hoisted variable declaration.
    assert.ok(written.get("a.gml").includes("var len ="));
});

void test("runCodemodAcrossFiles respects dryRun and does not call writeFile", async () => {
    const loopSource = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const files = { "a.gml": loopSource };
    let writeCallCount = 0;

    const { workspace, summary } = await runCodemodAcrossFiles(
        Object.keys(files),
        loopLengthCodemod,
        makeReadFile(files),
        {
            codemodOptions: {},
            dryRun: true,
            writeFile: async () => {
                writeCallCount++;
            }
        }
    );

    assert.equal(summary.changedFiles, 1);
    assert.equal(writeCallCount, 0, "writeFile must not be called in dry-run mode");
    // Edit is still recorded in the workspace.
    assert.equal(workspace.edits.length, 1);
});

void test("runCodemodAcrossFiles records skipped file when readFile throws", async () => {
    const files = { "good.gml": "var x = 1;\n" };
    const missingPath = "missing.gml";

    const { workspace, summary } = await runCodemodAcrossFiles(
        [missingPath, "good.gml"],
        loopLengthCodemod,
        makeReadFile(files),
        { codemodOptions: {} }
    );

    assert.equal(summary.skippedFiles, 1);
    assert.equal(summary.processedFiles, 1);
    assert.equal(summary.errors.has(missingPath), true);
    assert.ok((summary.errors.get(missingPath) ?? "").includes("Failed to read file"));
    assert.equal(workspace.edits.length, 0);
});

void test("runCodemodAcrossFiles records skipped file when codemod throws", async () => {
    const files = { "a.gml": "var x = 1;\n" };

    const { summary } = await runCodemodAcrossFiles(Object.keys(files), alwaysThrowingCodemod, makeReadFile(files), {
        codemodOptions: {}
    });

    assert.equal(summary.skippedFiles, 1);
    assert.equal(summary.processedFiles, 0);
    assert.equal(summary.errors.has("a.gml"), true);
    assert.ok((summary.errors.get("a.gml") ?? "").includes("Codemod error"));
});

void test("runCodemodAcrossFiles handles an empty file list gracefully", async () => {
    const { workspace, summary } = await runCodemodAcrossFiles([], loopLengthCodemod, makeReadFile({}), {
        codemodOptions: {}
    });

    assert.equal(workspace.edits.length, 0);
    assert.equal(summary.processedFiles, 0);
    assert.equal(summary.changedFiles, 0);
    assert.equal(summary.skippedFiles, 0);
});

void test("runCodemodAcrossFiles groups workspace edits correctly per file", async () => {
    const loop1 = "for (var i = 0; i < array_length(a); i++) {\n    x += i;\n}\n";
    const loop2 = "for (var j = 0; j < array_length(b); j++) {\n    y += j;\n}\n";
    const files = { "s1.gml": loop1, "s2.gml": loop2 };

    const { workspace, summary } = await runCodemodAcrossFiles(
        Object.keys(files),
        loopLengthCodemod,
        makeReadFile(files),
        {
            codemodOptions: {}
        }
    );

    assert.equal(summary.changedFiles, 2);
    assert.equal(workspace.edits.length, 2);

    const byFile = workspace.groupByFile();
    assert.ok(byFile.has("s1.gml"));
    assert.ok(byFile.has("s2.gml"));
});
