import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { isPathInside } from "../../shared/path-utils.js";

test("isPathInside returns true when child equals parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    assert.equal(isPathInside(root, root), true);
});

test("isPathInside returns true when child resides under parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    const child = path.join(root, "src", "index.gml");
    assert.equal(isPathInside(child, root), true);
});

test("isPathInside returns false when the child escapes the parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    const child = path.join(root, "..", "other", "file.gml");
    assert.equal(isPathInside(child, root), false);
});

test("isPathInside returns false for empty inputs", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    assert.equal(isPathInside("", root), false);
    assert.equal(isPathInside(root, ""), false);
});
