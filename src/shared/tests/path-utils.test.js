import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import {
    resolveContainedRelativePath,
    walkAncestorDirectories,
    collectUniqueAncestorDirectories
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
            assert.equal(relative, path.join("src", "index.gml"));
        });

        it("returns an empty string when both paths are identical", () => {
            const relative = resolveContainedRelativePath(
                projectRoot,
                projectRoot
            );
            assert.equal(relative, "");
        });

        it("returns null when the child escapes the parent", () => {
            const sibling = path.join(projectRoot, "..", "other", "file.gml");
            const relative = resolveContainedRelativePath(sibling, projectRoot);
            assert.equal(relative, null);
        });

        it("returns null for empty inputs", () => {
            assert.equal(resolveContainedRelativePath(null, projectRoot), null);
            assert.equal(resolveContainedRelativePath(childFile, null), null);
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

            assert.equal(ancestors.at(0), resolved);
            assert.equal(ancestors.at(-1), path.parse(resolved).root);
            assert.ok(ancestors.includes(path.dirname(resolved)));
        });

        it("skips invalid inputs", () => {
            const ancestors = [...walkAncestorDirectories(null)];
            assert.deepEqual(ancestors, []);
        });

        it("supports omitting the starting directory", () => {
            const resolved = path.resolve(nested);
            const ancestors = [
                ...walkAncestorDirectories(resolved, { includeSelf: false })
            ];

            assert.equal(ancestors.at(0), path.dirname(resolved));
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

            assert.equal(result[0], expectedFirst);
            assert.equal(result[1], expectedSecond);
            assert.equal(result.includes(expectedRoot), true);
            assert.equal(result.includes(path.resolve(second)), true);
        });
    });
});
