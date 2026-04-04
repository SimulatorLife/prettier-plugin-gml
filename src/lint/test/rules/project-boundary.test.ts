import test from "node:test";

import { Core } from "@gmloop/core";

import { assertEquals } from "../assertions.js";

void test("segment exclusions flag blocked directories", () => {
    const excludedDirectories = new Set(["vendor", "node_modules"]);

    assertEquals(Core.isDirectoryExcludedBySegments("/workspace/project/src/file.gml", excludedDirectories, []), false);
    assertEquals(
        Core.isDirectoryExcludedBySegments("/workspace/project/vendor/file.gml", excludedDirectories, []),
        true
    );
    assertEquals(
        Core.isDirectoryExcludedBySegments("/workspace/project/node_modules/pkg/index.gml", excludedDirectories, []),
        true
    );
});

void test("allowed directories override segment exclusions", () => {
    const excludedDirectories = new Set(["vendor"]);
    const allowedDirectories = ["/workspace/project/vendor/GameMaker-Manual"];

    assertEquals(
        Core.isDirectoryExcludedBySegments(
            "/workspace/project/vendor/GameMaker-Manual/page.gml",
            excludedDirectories,
            allowedDirectories
        ),
        false
    );
    assertEquals(
        Core.isDirectoryExcludedBySegments(
            "/workspace/project/vendor/Other/file.gml",
            excludedDirectories,
            allowedDirectories
        ),
        true
    );
});
