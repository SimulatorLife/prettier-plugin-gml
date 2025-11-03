import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { resolveProjectPathInfo } from "../src/project-index/path-info.js";

describe("project-index/path-info", () => {
    it("returns null for empty inputs", () => {
        assert.strictEqual(resolveProjectPathInfo(null, "/tmp"), null);
        assert.strictEqual(resolveProjectPathInfo("", "/tmp"), null);
    });

    it("normalizes absolute paths without a project root", () => {
        const samplePath = path.join(process.cwd(), "src", "file.gml");
        const info = resolveProjectPathInfo(samplePath);

        assert.ok(info);
        assert.strictEqual(info.absolutePath, path.resolve(samplePath));
        assert.strictEqual(info.relativePath, path.resolve(samplePath));
        assert.strictEqual(info.hasProjectRoot, false);
        assert.strictEqual(info.isInsideProjectRoot, false);
    });

    it("computes relative paths and containment when a root is provided", () => {
        const projectRoot = path.join(
            process.cwd(),
            "tmp",
            "project-index-path-info"
        );
        const nested = path.join(projectRoot, "src", "index.gml");

        const info = resolveProjectPathInfo(nested, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.hasProjectRoot, true);
        assert.strictEqual(info.isInsideProjectRoot, true);
        assert.strictEqual(info.relativePath, path.join("src", "index.gml"));
    });

    it("tracks when a file escapes the project root", () => {
        const projectRoot = path.join(
            process.cwd(),
            "tmp",
            "project-index-path-info"
        );
        const sibling = path.join(projectRoot, "..", "other", "file.gml");

        const info = resolveProjectPathInfo(sibling, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.hasProjectRoot, true);
        assert.strictEqual(info.isInsideProjectRoot, false);
        assert.strictEqual(
            info.relativePath,
            path.relative(path.resolve(projectRoot), path.resolve(sibling))
        );
    });
});
