import assert from "node:assert/strict";
import { test } from "node:test";

import { Parser } from "../src/index.js";

void test("parser public API keeps internal doc-comment attachment normalization private", () => {
    assert.equal(
        "normalizeFunctionDocCommentAttachments" in Parser,
        false,
        "Parser should expose parsing/runtime contracts, not internal attachment normalizers."
    );
});
