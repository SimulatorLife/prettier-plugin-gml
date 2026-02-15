/**
 * Tests for workspace-edit utilities
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { getWorkspaceArrays, WorkspaceEdit } from "../src/workspace-edit.js";

void test("getWorkspaceArrays extracts valid arrays from workspace", () => {
    const workspace = new WorkspaceEdit();
    workspace.addMetadataEdit("file1.yy", "content1");
    workspace.addMetadataEdit("file2.yy", "content2");
    workspace.addFileRename("old.gml", "new.gml");

    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 2);
    assert.equal(metadataEdits[0].path, "file1.yy");
    assert.equal(metadataEdits[0].content, "content1");
    assert.equal(metadataEdits[1].path, "file2.yy");
    assert.equal(metadataEdits[1].content, "content2");

    assert.equal(fileRenames.length, 1);
    assert.equal(fileRenames[0].oldPath, "old.gml");
    assert.equal(fileRenames[0].newPath, "new.gml");
});

void test("getWorkspaceArrays returns empty arrays when properties are missing", () => {
    const workspace = {};
    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 0);
    assert.equal(fileRenames.length, 0);
});

void test("getWorkspaceArrays returns empty arrays when properties are not arrays", () => {
    const workspace = {
        metadataEdits: "not an array",
        fileRenames: 42
    };
    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 0);
    assert.equal(fileRenames.length, 0);
});

void test("getWorkspaceArrays returns empty arrays when properties are null", () => {
    const workspace = {
        metadataEdits: null,
        fileRenames: null
    };
    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 0);
    assert.equal(fileRenames.length, 0);
});

void test("getWorkspaceArrays returns empty arrays when properties are undefined", () => {
    const workspace = {
        metadataEdits: undefined,
        fileRenames: undefined
    };
    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 0);
    assert.equal(fileRenames.length, 0);
});

void test("getWorkspaceArrays handles empty arrays", () => {
    const workspace = {
        metadataEdits: [],
        fileRenames: []
    };
    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.equal(metadataEdits.length, 0);
    assert.equal(fileRenames.length, 0);
});

void test("getWorkspaceArrays preserves array contents", () => {
    const expectedMetadata = [
        { path: "a.yy", content: "content-a" },
        { path: "b.yy", content: "content-b" }
    ];
    const expectedRenames = [{ oldPath: "x.gml", newPath: "y.gml" }];

    const workspace = {
        metadataEdits: expectedMetadata,
        fileRenames: expectedRenames
    };

    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);

    assert.deepEqual(metadataEdits, expectedMetadata);
    assert.deepEqual(fileRenames, expectedRenames);
});
