import assert from "node:assert/strict";
import test from "node:test";

import {
    ProjectFileCategory,
    normalizeProjectFileCategory,
    resolveProjectFileCategory
} from "../src/project-index/index.js";

test("normalizeProjectFileCategory accepts known categories", () => {
    assert.equal(
        normalizeProjectFileCategory(ProjectFileCategory.SOURCE),
        ProjectFileCategory.SOURCE
    );
    assert.equal(
        normalizeProjectFileCategory(ProjectFileCategory.RESOURCE_METADATA),
        ProjectFileCategory.RESOURCE_METADATA
    );
});

test("normalizeProjectFileCategory rejects unknown categories", () => {
    assert.throws(
        () => normalizeProjectFileCategory("yaml"),
        /Project file category must be one of: /
    );
});

test("resolveProjectFileCategory recognises GML source files", () => {
    assert.equal(
        resolveProjectFileCategory("scripts/player/move.gml"),
        ProjectFileCategory.SOURCE
    );
});

test("resolveProjectFileCategory recognises resource manifests", () => {
    assert.equal(
        resolveProjectFileCategory("objects/player/player.yy"),
        ProjectFileCategory.RESOURCE_METADATA
    );
    assert.equal(
        resolveProjectFileCategory("project/GameProject.yyp"),
        ProjectFileCategory.RESOURCE_METADATA
    );
});

test("resolveProjectFileCategory returns null for unrelated files", () => {
    assert.equal(resolveProjectFileCategory("notes/readme.md"), null);
});
