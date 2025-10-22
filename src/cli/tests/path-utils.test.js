import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { isPathInside } from "../../shared/utils/path.js";

// Node deprecated the legacy assert.equal helper; prefer assert.strictEqual so
// the tests lock in both value and type. This mirrors how callers rely on
// boolean results in production code.

test("isPathInside returns true when child equals parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    assert.strictEqual(isPathInside(root, root), true);
});

test("isPathInside returns true when child resides under parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    const child = path.join(root, "src", "index.gml");
    assert.strictEqual(isPathInside(child, root), true);
});

test("isPathInside returns false when the child escapes the parent", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    const child = path.join(root, "..", "other", "file.gml");
    assert.strictEqual(isPathInside(child, root), false);
});

test("isPathInside returns false for empty inputs", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    assert.strictEqual(isPathInside("", root), false);
    assert.strictEqual(isPathInside(root, ""), false);
});

test("isPathInside always returns a boolean", () => {
    const root = path.join(process.cwd(), "tmp", "cli-path-utils");
    assert.strictEqual(typeof isPathInside(root, root), "boolean");
    assert.strictEqual(typeof isPathInside(root, ""), "boolean");
});
