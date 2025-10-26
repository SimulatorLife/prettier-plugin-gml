import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

// Node.js deprecated the legacy assert.equal-style helpers; use the strict
// variants to ensure consistent comparisons across runtimes.
import {
    isPathInside,
    resolveContainedRelativePath,
    walkAncestorDirectories
} from "../utils/path.js";

describe("path-utils", () => {
    describe("resolveContainedRelativePath", () => {
        const projectRoot = path.join(
            process.cwd(),
            "tmp",
            "shared-path-utils"
        );
        const childFile = path.join(projectRoot, "src", "index.gml");

        it("returns a relative path when the child is inside the parent", () => {
            const relative = resolveContainedRelativePath(
                childFile,
                projectRoot
            );
            assert.strictEqual(relative, path.join("src", "index.gml"));
        });

        it("returns an empty string when both paths are identical", () => {
            const relative = resolveContainedRelativePath(
                projectRoot,
                projectRoot
            );
            assert.strictEqual(relative, "");
        });

        it("returns null when the child escapes the parent", () => {
            const sibling = path.join(projectRoot, "..", "other", "file.gml");
            const relative = resolveContainedRelativePath(sibling, projectRoot);
            assert.strictEqual(relative, null);
        });

        it("returns null for empty inputs", () => {
            assert.strictEqual(
                resolveContainedRelativePath(null, projectRoot),
                null
            );
            assert.strictEqual(
                resolveContainedRelativePath(childFile, null),
                null
            );
        });
    });

    describe("walkAncestorDirectories", () => {
        const projectRoot = path.join(
            process.cwd(),
            "tmp",
            "shared-path-utils",
            "ancestors"
        );
        const nested = path.join(projectRoot, "src", "features", "module");

        it("yields each ancestor from the starting directory to the root", () => {
            const resolved = path.resolve(nested);
            const ancestors = [...walkAncestorDirectories(resolved)];

            assert.strictEqual(ancestors.at(0), resolved);
            assert.strictEqual(ancestors.at(-1), path.parse(resolved).root);
            assert.ok(ancestors.includes(path.dirname(resolved)));
        });

        it("skips invalid inputs", () => {
            const ancestors = [...walkAncestorDirectories(null)];
            assert.deepStrictEqual(ancestors, []);
        });

        it("supports omitting the starting directory", () => {
            const resolved = path.resolve(nested);
            const ancestors = [
                ...walkAncestorDirectories(resolved, { includeSelf: false })
            ];

            assert.strictEqual(ancestors.at(0), path.dirname(resolved));
        });
    });

    describe("isPathInside", () => {
        it("returns true when child equals parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            assert.strictEqual(isPathInside(root, root), true);
        });

        it("returns true when child resides under parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            const child = path.join(root, "src", "index.gml");
            assert.strictEqual(isPathInside(child, root), true);
        });

        it("returns false when the child escapes the parent", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            const child = path.join(root, "..", "other", "file.gml");
            assert.strictEqual(isPathInside(child, root), false);
        });

        it("returns false for empty inputs", () => {
            const root = path.join(process.cwd(), "tmp", "shared-path-utils");
            assert.strictEqual(isPathInside("", root), false);
            assert.strictEqual(isPathInside(root, ""), false);
        });
    });
});
