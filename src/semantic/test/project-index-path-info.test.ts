import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveProjectPathInfo } from "../src/project-index/path-info.js";

void describe("project-index/path-info", () => {
    void it("returns null for empty inputs", () => {
        assert.strictEqual(resolveProjectPathInfo(null, "/tmp"), null);
        assert.strictEqual(resolveProjectPathInfo("", "/tmp"), null);
    });

    void it("normalizes absolute paths without a project root", () => {
        const samplePath = path.join(process.cwd(), "src", "file.gml");
        const info = resolveProjectPathInfo(samplePath);

        assert.ok(info);
        assert.strictEqual(info.absolutePath, path.resolve(samplePath));
        assert.strictEqual(info.relativePath, path.resolve(samplePath));
        assert.strictEqual(info.hasProjectRoot, false);
        assert.strictEqual(info.isInsideProjectRoot, false);
    });

    void it("computes relative paths and containment when a root is provided", () => {
        const projectRoot = path.join(process.cwd(), "tmp", "project-index-path-info");
        const nested = path.join(projectRoot, "src", "index.gml");

        const info = resolveProjectPathInfo(nested, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.hasProjectRoot, true);
        assert.strictEqual(info.isInsideProjectRoot, true);
        assert.strictEqual(info.relativePath, path.join("src", "index.gml"));
    });

    void it("tracks when a file escapes the project root", () => {
        const projectRoot = path.join(process.cwd(), "tmp", "project-index-path-info");
        const sibling = path.join(projectRoot, "..", "other", "file.gml");

        const info = resolveProjectPathInfo(sibling, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.hasProjectRoot, true);
        assert.strictEqual(info.isInsideProjectRoot, false);
        assert.strictEqual(info.relativePath, path.relative(path.resolve(projectRoot), path.resolve(sibling)));
    });

    void it("supports Windows-style absolute paths on non-Windows hosts", () => {
        const projectRoot = path.win32.join("C:\\", "GameMaker", "Project");
        const filePath = path.win32.join(projectRoot, "scripts", "init.gml");

        const info = resolveProjectPathInfo(filePath, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.inputWasAbsolute, true);
        assert.strictEqual(info.isInsideProjectRoot, true);
        assert.strictEqual(info.relativePath, path.win32.join("scripts", "init.gml"));
    });

    void it("treats POSIX absolute paths as POSIX, not Win32", () => {
        const projectRoot = "/tmp/project";
        const filePath = "/tmp/project/scripts/player.gml";

        const info = resolveProjectPathInfo(filePath, projectRoot);

        assert.ok(info);
        assert.strictEqual(info.inputWasAbsolute, true);
        assert.strictEqual(info.isInsideProjectRoot, true);
        // Should use POSIX separators, not backslashes
        assert.strictEqual(info.relativePath, "scripts/player.gml");
        assert.strictEqual(info.absolutePath, path.resolve(filePath));
        // Verify no backslashes in the output (which would indicate Win32 processing)
        assert.ok(!info.absolutePath.includes("\\"));
        assert.ok(!info.relativePath.includes("\\"));
    });
});
