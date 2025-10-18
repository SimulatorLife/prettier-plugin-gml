import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { resolveContainedRelativePath } from "../path-utils.js";

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
});
