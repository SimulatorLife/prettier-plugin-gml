import assert from "node:assert/strict";
import test from "node:test";

import { isPathWithinBoundary } from "../src/services/path-boundary.js";

test("posix boundary comparison is segment-safe", () => {
    assert.equal(isPathWithinBoundary("/root/sub/file.gml", "/root"), true);
    assert.equal(isPathWithinBoundary("/root2/file.gml", "/root"), false);
});

test("windows drive boundary comparison is segment-safe", () => {
    assert.equal(isPathWithinBoundary(String.raw`C:\root\sub\file.gml`, String.raw`C:\root`), true);
    assert.equal(isPathWithinBoundary(String.raw`C:\root2\file.gml`, String.raw`C:\root`), false);
});

test("UNC boundary comparison is segment-safe", () => {
    assert.equal(isPathWithinBoundary(String.raw`\\server\share\root\sub\file.gml`, "\\\\server\\share\\root\\"), true);
    assert.equal(isPathWithinBoundary(String.raw`\\server\share\root2\file.gml`, "\\\\server\\share\\root\\"), false);
});
