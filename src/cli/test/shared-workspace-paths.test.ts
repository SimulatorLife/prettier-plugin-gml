/**
 * Regression tests for the workspace-paths shared utility.
 *
 * These tests guard the migration from the verbose
 * `path.dirname(fileURLToPath(import.meta.url))` workaround to the
 * `import.meta.dirname` built-in (stable since Node.js 21.2 / 20.11).
 * They verify that the exported constants still point to valid directories
 * after the change, providing behaviour-parity coverage.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CLI_PACKAGE_DIRECTORY, REPO_ROOT, resolveFromRepoRoot } from "../src/shared/workspace-paths.js";

/** Expected directory that the test file itself lives in (dist/test/). */
const THIS_TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

void describe("shared workspace-paths constants (import.meta.dirname migration)", () => {
    void it("CLI_PACKAGE_DIRECTORY is an absolute path", () => {
        assert.ok(path.isAbsolute(CLI_PACKAGE_DIRECTORY), "CLI_PACKAGE_DIRECTORY must be absolute");
    });

    void it("CLI_PACKAGE_DIRECTORY contains a package.json named @gml-modules/cli", async () => {
        const pkgJsonPath = path.resolve(CLI_PACKAGE_DIRECTORY, "package.json");
        const raw = await fs.readFile(pkgJsonPath, "utf8");
        const parsed: unknown = JSON.parse(raw);
        assert.ok(parsed !== null && typeof parsed === "object");
        assert.strictEqual((parsed as Record<string, unknown>).name, "@gml-modules/cli");
    });

    void it("REPO_ROOT is an absolute path that exists on disk", async () => {
        assert.ok(path.isAbsolute(REPO_ROOT), "REPO_ROOT must be absolute");
        const stat = await fs.stat(REPO_ROOT);
        assert.ok(stat.isDirectory(), "REPO_ROOT must point to a directory");
    });

    void it("REPO_ROOT is a strict ancestor of CLI_PACKAGE_DIRECTORY", () => {
        // The CLI workspace lives inside the repository root.
        assert.ok(
            CLI_PACKAGE_DIRECTORY.startsWith(REPO_ROOT + path.sep),
            `CLI_PACKAGE_DIRECTORY (${CLI_PACKAGE_DIRECTORY}) should be under REPO_ROOT (${REPO_ROOT})`
        );
    });

    void it("resolveFromRepoRoot builds paths anchored at REPO_ROOT", () => {
        const joined = resolveFromRepoRoot("src", "cli");
        assert.strictEqual(joined, path.resolve(REPO_ROOT, "src", "cli"));
    });

    void it("import.meta.dirname (new) equals path.dirname(fileURLToPath(import.meta.url)) (old) in this module", () => {
        // This test directly validates the API equivalence that the migration relies on.
        // Both expressions must point to the same directory: the current module's directory.
        const modernValue = import.meta.dirname;
        const legacyValue = path.dirname(fileURLToPath(import.meta.url));
        assert.strictEqual(modernValue, legacyValue);
        // Sanity: must be the dist/test directory this test is running from.
        assert.strictEqual(modernValue, THIS_TEST_DIR);
    });
});
