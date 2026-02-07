import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { normalizeProjectResourcePath } from "../src/project-index/path-normalization.js";

void describe("project-index/path-normalization", () => {
    void it("normalizes Windows-style absolute paths against a project root", () => {
        const projectRoot = path.win32.join("C:\\", "GameMaker", "Project");
        const filePath = path.win32.join(projectRoot, "scripts", "init.gml");

        const result = normalizeProjectResourcePath(filePath, { projectRoot });

        assert.strictEqual(result, "scripts/init.gml");
    });
});
