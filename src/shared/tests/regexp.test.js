import assert from "node:assert/strict";
import test from "node:test";

import { escapeRegExp } from "../regexp.js";

test("escapeRegExp escapes special characters", () => {
    assert.equal(escapeRegExp(".*?^${}"), "\\.\\*\\?\\^\\$\\{\\}");
    assert.equal(escapeRegExp("Hello"), "Hello");
    assert.equal(escapeRegExp("path/[segment]"), "path/\\[segment\\]");
});

test("escapeRegExp returns empty string for non-string input", () => {
    assert.equal(escapeRegExp(undefined), "");
    assert.equal(escapeRegExp(null), "");
    assert.equal(escapeRegExp(42), "");
});
