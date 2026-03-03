import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as LintWorkspace from "../../src/index.js";

void test("posix boundary comparison is segment-safe", () => {
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary("/root/sub/file.gml", "/root"), true);
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary("/root2/file.gml", "/root"), false);
});

void test("windows drive boundary comparison is segment-safe", () => {
    assert.equal(
        LintWorkspace.Lint.services.isPathWithinBoundary(String.raw`C:\root\sub\file.gml`, String.raw`C:\root`),
        true
    );
    assert.equal(
        LintWorkspace.Lint.services.isPathWithinBoundary(String.raw`C:\root2\file.gml`, String.raw`C:\root`),
        false
    );
});

void test("UNC boundary comparison is segment-safe", () => {
    assert.equal(
        LintWorkspace.Lint.services.isPathWithinBoundary(
            String.raw`\\server\share\root\sub\file.gml`,
            "\\\\server\\share\\root\\"
        ),
        true
    );
    assert.equal(
        LintWorkspace.Lint.services.isPathWithinBoundary(
            String.raw`\\server\share\root2\file.gml`,
            "\\\\server\\share\\root\\"
        ),
        false
    );
});

void test("boundary handling normalizes root separators", () => {
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary("/root/sub/file.gml", "/root/"), true);
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary(String.raw`C:\Root\sub\file.gml`, "c:/root/"), true);
    assert.equal(
        LintWorkspace.Lint.services.isPathWithinBoundary(
            String.raw`\\server\share\root\sub\file.gml`,
            String.raw`\\server\share\root`
        ),
        true
    );
});

void test("boundary handling uses realpath when available and falls back for missing paths", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-boundary-"));
    const canonicalDirectory = path.join(tempRoot, "canonical");
    const symlinkDirectory = path.join(tempRoot, "symlink");

    mkdirSync(canonicalDirectory, { recursive: true });
    symlinkSync(canonicalDirectory, symlinkDirectory, "dir");

    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary(symlinkDirectory, canonicalDirectory), true);

    const missingFile = path.join(tempRoot, "missing", "path", "file.gml");
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary(missingFile, path.join(tempRoot, "missing")), true);

    rmSync(tempRoot, { recursive: true, force: true });
});
