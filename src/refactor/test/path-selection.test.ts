import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
    createPathSelectionMatcher,
    isPathSelectedByLists,
    resolveProjectPath
} from "../src/codemods/naming-convention/path-selection.js";

void test("resolveProjectPath resolves relative and preserves absolute paths", () => {
    const projectRoot = "/workspace/project";

    assert.equal(
        resolveProjectPath(projectRoot, "scripts/player.gml"),
        path.resolve(projectRoot, "scripts/player.gml")
    );
    assert.equal(resolveProjectPath(projectRoot, "/tmp/example.gml"), "/tmp/example.gml");
});

void test("isPathSelectedByLists allows all paths when allow list is empty", () => {
    const projectRoot = "/workspace/project";
    assert.equal(isPathSelectedByLists(projectRoot, "scripts/player.gml", [], []), true);
});

void test("isPathSelectedByLists applies allow list using exact and descendant matches", () => {
    const projectRoot = "/workspace/project";
    assert.equal(isPathSelectedByLists(projectRoot, "scripts/player/step.gml", ["scripts/player"], []), true);
    assert.equal(isPathSelectedByLists(projectRoot, "scripts/enemy.gml", ["scripts/player"], []), false);
});

void test("isPathSelectedByLists applies deny list after allow list checks", () => {
    const projectRoot = "/workspace/project";
    assert.equal(isPathSelectedByLists(projectRoot, "scripts/player/step.gml", ["scripts"], ["scripts/player"]), false);
    assert.equal(isPathSelectedByLists(projectRoot, "scripts/enemy/step.gml", ["scripts"], ["scripts/player"]), true);
});

void test("createPathSelectionMatcher reuses resolved path selections across multiple candidates", () => {
    const projectRoot = "/workspace/project";
    const isSelected = createPathSelectionMatcher(projectRoot, ["scripts", "/tmp/shared"], ["scripts/player"]);

    assert.equal(isSelected("scripts/enemy/step.gml"), true);
    assert.equal(isSelected("scripts/player/step.gml"), false);
    assert.equal(isSelected("/tmp/shared/child.gml"), true);
    assert.equal(isSelected("objects/o_player/o_player.yy"), false);
});
