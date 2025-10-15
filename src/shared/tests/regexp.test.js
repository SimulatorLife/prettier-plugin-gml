import assert from "node:assert/strict";
import test from "node:test";

import { escapeRegExp } from "../regexp.js";

test("escapeRegExp escapes special characters", () => {
    assert.equal(escapeRegExp(".*?^${}"), String.raw`\.\*\?\^\$\{\}`);
    assert.equal(escapeRegExp("Hello"), "Hello");
    assert.equal(escapeRegExp("path/[segment]"), String.raw`path/\[segment\]`);
});

test("escapeRegExp returns empty string for non-string input", () => {
    assert.equal(escapeRegExp(), "");
    assert.equal(escapeRegExp(null), "");
    assert.equal(escapeRegExp(42), "");
});
