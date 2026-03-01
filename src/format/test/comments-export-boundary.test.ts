import assert from "node:assert/strict";
import test from "node:test";

import * as Comments from "../src/comments/index.js";

void test("comments barrel excludes doc-like content normalizers", () => {
    assert.ok(
        !("formatDocLikeLineComment" in Comments),
        "format comments barrel must not expose content-normalization helpers"
    );
    assert.ok(
        !("normalizeDocLikeLineComment" in Comments),
        "format comments barrel must not expose content-normalization helpers"
    );
});
