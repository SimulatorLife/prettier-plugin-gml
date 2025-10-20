import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

// Node.js deprecated the legacy assert.equal-style helpers; use the strict
// variants to ensure consistent comparisons across runtimes.
import {
    collectAncestorDirectories,
    collectUniqueAncestorDirectories,
    isPathInside,
    resolveProjectPathInfo,
    resolveContainedRelativePath,
    walkAncestorDirectories
} from "../path-utils.js";

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

    describe("collectUniqueAncestorDirectories", () => {
        it("deduplicates ancestors across multiple starting directories", () => {
            const base = path.join(
                process.cwd(),
                "tmp",
                "shared-path-utils",
                "multi"
            );
            const first = path.join(base, "project", "src");
            const second = path.join(base, "project", "tests");

            const result = collectUniqueAncestorDirectories([first, second]);

            const expectedFirst = path.resolve(first);
            const expectedSecond = path.resolve(path.join(base, "project"));
            const expectedRoot = path.parse(expectedFirst).root;

            assert.strictEqual(result[0], expectedFirst);
            assert.strictEqual(result[1], expectedSecond);
            assert.strictEqual(result.includes(expectedRoot), true);
            assert.strictEqual(result.includes(path.resolve(second)), true);
        });
    });

    describe("collectAncestorDirectories", () => {
        it("accepts multiple path arguments and preserves discovery order", () => {
            const base = path.join(
                process.cwd(),
                "tmp",
                "shared-path-utils",
                "rest-args"
            );
            const nestedFeature = path.join(base, "src", "features", "core");
            const nestedSibling = path.join(base, "src", "features", "extras");

            const result = collectAncestorDirectories(
                nestedFeature,
                nestedSibling
            );

            const expectedFirst = path.resolve(nestedFeature);
            const expectedRoot = path.parse(expectedFirst).root;

            assert.strictEqual(result[0], expectedFirst);
            assert.strictEqual(result.includes(expectedRoot), true);
            assert.strictEqual(new Set(result).size, result.length);
        });

        it("ignores empty inputs while still returning valid ancestors", () => {
            const projectRoot = path.join(
                process.cwd(),
                "tmp",
                "shared-path-utils",
                "empties"
            );

            const result = collectAncestorDirectories(
                null,
                undefined,
                "",
                projectRoot
            );

            assert.strictEqual(result[0], path.resolve(projectRoot));
        });
    });

    describe("resolveProjectPathInfo", () => {
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
                "shared-path-utils"
            );
            const nested = path.join(projectRoot, "src", "index.gml");

            const info = resolveProjectPathInfo(nested, projectRoot);

            assert.ok(info);
            assert.strictEqual(info.hasProjectRoot, true);
            assert.strictEqual(info.isInsideProjectRoot, true);
            assert.strictEqual(
                info.relativePath,
                path.join("src", "index.gml")
            );
        });

        it("tracks when a file escapes the project root", () => {
            const projectRoot = path.join(
                process.cwd(),
                "tmp",
                "shared-path-utils"
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
