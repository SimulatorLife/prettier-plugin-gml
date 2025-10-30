import assert from "node:assert/strict";
import test from "node:test";

import {
    ProjectFileCategory,
    normalizeProjectFileCategory,
    resolveProjectFileCategory,
    getProjectIndexSourceExtensions,
    resetProjectIndexSourceExtensions,
    setProjectIndexSourceExtensions,
    getProjectResourceMetadataExtensions,
    resetProjectResourceMetadataExtensions,
    setProjectResourceMetadataExtensions,
    matchProjectResourceMetadataExtension
} from "../src/project-index/index.js";

test.afterEach(() => {
    resetProjectIndexSourceExtensions();
    resetProjectResourceMetadataExtensions();
});

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

test("project index source extensions expose the default list", () => {
    const defaults = getProjectIndexSourceExtensions();
    assert.deepEqual(defaults, [".gml"]);
    assert.throws(() => {
        defaults.push(".gmlx");
    }, TypeError);
});

test("setProjectIndexSourceExtensions extends recognised source files", () => {
    setProjectIndexSourceExtensions([".gmlx"]);
    assert.deepEqual(getProjectIndexSourceExtensions(), [".gml", ".gmlx"]);
    assert.equal(
        resolveProjectFileCategory("scripts/player/move.gmlx"),
        ProjectFileCategory.SOURCE
    );
    assert.equal(
        resolveProjectFileCategory("scripts/player/move.gml"),
        ProjectFileCategory.SOURCE
    );
});

test("setProjectIndexSourceExtensions normalises and deduplicates extensions", () => {
    setProjectIndexSourceExtensions([" GMLX ", ".gmlx", "custom"]);
    assert.deepEqual(getProjectIndexSourceExtensions(), [
        ".gml",
        ".gmlx",
        ".custom"
    ]);
});

test("setProjectIndexSourceExtensions rejects invalid input", () => {
    assert.throws(
        () => setProjectIndexSourceExtensions("gml"),
        /array of strings/
    );
    assert.throws(
        () => setProjectIndexSourceExtensions([""]),
        /cannot be empty/
    );
    assert.throws(
        () => setProjectIndexSourceExtensions([42]),
        /must be strings/
    );
});

test("resource metadata extensions expose the default list", () => {
    const defaults = getProjectResourceMetadataExtensions();
    assert.deepEqual(defaults, [".yy"]);
    assert.throws(() => {
        defaults.push(".yyz");
    }, TypeError);
});

test("resource metadata extension overrides extend detection", () => {
    setProjectResourceMetadataExtensions([".meta"]);
    assert.deepEqual(getProjectResourceMetadataExtensions(), [".yy", ".meta"]);
    assert.equal(
        resolveProjectFileCategory("objects/player/player.meta"),
        ProjectFileCategory.RESOURCE_METADATA
    );
    assert.equal(
        resolveProjectFileCategory("objects/player/player.yy"),
        ProjectFileCategory.RESOURCE_METADATA
    );
});

test("resource metadata extension overrides normalise input", () => {
    setProjectResourceMetadataExtensions([" .YYZ", "", null, ".yyz"]);
    assert.deepEqual(getProjectResourceMetadataExtensions(), [".yy", ".yyz"]);
    assert.equal(
        matchProjectResourceMetadataExtension("objects/player/player.YYZ"),
        ".yyz"
    );
});
