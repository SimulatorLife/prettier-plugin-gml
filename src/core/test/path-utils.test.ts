import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// Node.js deprecated the legacy assert.equal-style helpers; use the strict
// variants to ensure consistent comparisons across runtimes.
import {
    isPathInside,
    isPathWithinBoundary,
    normalizeBoundaryPath,
    resolveContainedRelativePath,
    walkAncestorDirectories
} from "../src/fs/path.js";

void describe("path-utils", () => {
    void describe("resolveContainedRelativePath", () => {
        const projectRoot = path.join(process.cwd(), "tmp", "shared-path-utils");
        const childFile = path.join(projectRoot, "src", "index.gml");

        void it("returns a relative path when the child is inside the parent", () => {
            const relative = resolveContainedRelativePath(childFile, projectRoot);
            assert.strictEqual(relative, path.join("src", "index.gml"));
        });

        void it("allows child segments that begin with double dots", () => {
            const dottedChild = path.join(projectRoot, "..filename");
            const relative = resolveContainedRelativePath(dottedChild, projectRoot);
            assert.strictEqual(relative, "..filename");
        });

        void it("returns an empty string when both paths are identical", () => {
            const relative = resolveContainedRelativePath(projectRoot, projectRoot);
            assert.strictEqual(relative, "");
        });

        void it("returns null when the child escapes the parent", () => {
            const sibling = path.join(projectRoot, "..", "other", "file.gml");
            const relative = resolveContainedRelativePath(sibling, projectRoot);
            assert.strictEqual(relative, null);
        });

        void it("returns null for empty inputs", () => {
            assert.strictEqual(resolveContainedRelativePath(null, projectRoot), null);
            assert.strictEqual(resolveContainedRelativePath(childFile, null), null);
        });
    });

    void describe("walkAncestorDirectories", () => {
        const projectRoot = path.join(process.cwd(), "tmp", "shared-path-utils", "ancestors");
        const nested = path.join(projectRoot, "src", "features", "module");

        void it("yields each ancestor from the starting directory to the root", () => {
            const resolved = path.resolve(nested);
            const ancestors = [...walkAncestorDirectories(resolved)];

            assert.strictEqual(ancestors.at(0), resolved);
            assert.strictEqual(ancestors.at(-1), path.parse(resolved).root);
            assert.ok(ancestors.includes(path.dirname(resolved)));
        });

        void it("skips invalid inputs", () => {
            const ancestors = [...walkAncestorDirectories(null)];
            assert.deepStrictEqual(ancestors, []);
        });

        void it("supports omitting the starting directory", () => {
            const resolved = path.resolve(nested);
            const ancestors = [...walkAncestorDirectories(resolved, { includeSelf: false })];

            assert.strictEqual(ancestors.at(0), path.dirname(resolved));
        });
    });

    void describe("isPathInside", () => {
        void it("returns true when child equals parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            assert.strictEqual(isPathInside(root, root), true);
        });

        void it("returns true when child resides under parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            const child = path.join(root, "src", "index.gml");
            assert.strictEqual(isPathInside(child, root), true);
        });

        void it("returns true for child names that begin with double dots", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            const child = path.join(root, "..filename");
            assert.strictEqual(isPathInside(child, root), true);
        });

        void it("returns false when the child escapes the parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            const child = path.join(root, "..", "other", "file.gml");
            assert.strictEqual(isPathInside(child, root), false);
        });

        void it("returns false for empty inputs", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            assert.strictEqual(isPathInside("", root), false);
            assert.strictEqual(isPathInside(root, ""), false);
        });
    });
});

void describe("normalizeBoundaryPath", () => {
    void it("trims trailing separators from POSIX paths", () => {
        assert.strictEqual(normalizeBoundaryPath("/root/sub/"), "/root/sub");
    });

    void it("falls back to lexical normalization for non-existent paths", () => {
        const missing = "/nonexistent-path-for-test/file.gml";
        assert.strictEqual(normalizeBoundaryPath(missing), missing);
    });

    void it("resolves symlinks when the target exists", () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), "core-boundary-"));
        const canonical = path.join(tempRoot, "canonical");
        const symlink = path.join(tempRoot, "symlink");
        mkdirSync(canonical, { recursive: true });
        symlinkSync(canonical, symlink, "dir");

        assert.strictEqual(normalizeBoundaryPath(symlink), normalizeBoundaryPath(canonical));

        rmSync(tempRoot, { recursive: true, force: true });
    });
});

void describe("isPathWithinBoundary", () => {
    void it("returns true when the file is directly inside the root", () => {
        assert.strictEqual(isPathWithinBoundary("/root/sub/file.gml", "/root"), true);
    });

    void it("returns false when the file is outside the root", () => {
        assert.strictEqual(isPathWithinBoundary("/root2/file.gml", "/root"), false);
    });

    void it("is segment-safe and does not match partial directory names", () => {
        assert.strictEqual(isPathWithinBoundary("/rootmore/file.gml", "/root"), false);
    });

    void it("returns true when the file path equals the root", () => {
        assert.strictEqual(isPathWithinBoundary("/root", "/root"), true);
    });

    void it("handles a trailing separator on the root without false positives", () => {
        assert.strictEqual(isPathWithinBoundary("/root/sub/file.gml", "/root/"), true);
        assert.strictEqual(isPathWithinBoundary("/root2/file.gml", "/root/"), false);
    });

    void it("returns false when either argument is empty", () => {
        assert.strictEqual(isPathWithinBoundary("", "/root"), false);
        assert.strictEqual(isPathWithinBoundary("/root/file.gml", ""), false);
    });
});
