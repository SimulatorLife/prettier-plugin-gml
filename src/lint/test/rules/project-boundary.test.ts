import test from "node:test";

import { isDirectoryExcludedBySegments } from "../../src/services/path-boundary.js";
import { assertEquals } from "../assertions.js";

void test("segment exclusions flag blocked directories", () => {
    const excludedDirectories = new Set(["vendor", "node_modules"]);

    assertEquals(isDirectoryExcludedBySegments("/workspace/project/src/file.gml", excludedDirectories, []), false);
    assertEquals(isDirectoryExcludedBySegments("/workspace/project/vendor/file.gml", excludedDirectories, []), true);
    assertEquals(
        isDirectoryExcludedBySegments("/workspace/project/node_modules/pkg/index.gml", excludedDirectories, []),
        true
    );
});

void test("allowed directories override segment exclusions", () => {
    const excludedDirectories = new Set(["vendor"]);
    const allowedDirectories = ["/workspace/project/vendor/GameMaker-Manual"];

    assertEquals(
        isDirectoryExcludedBySegments(
            "/workspace/project/vendor/GameMaker-Manual/page.gml",
            excludedDirectories,
            allowedDirectories
        ),
        false
    );
    assertEquals(
        isDirectoryExcludedBySegments(
            "/workspace/project/vendor/Other/file.gml",
            excludedDirectories,
            allowedDirectories
        ),
        true
    );
});
