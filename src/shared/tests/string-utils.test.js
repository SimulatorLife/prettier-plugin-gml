import test from "node:test";
import assert from "node:assert/strict";

import {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toTrimmedString,
    capitalize
} from "../string-utils.js";

test("toTrimmedString returns trimmed strings", () => {
    assert.equal(toTrimmedString("  value  "), "value");
    assert.equal(toTrimmedString("value"), "value");
    assert.equal(toTrimmedString(""), "");
});

test("toTrimmedString normalizes non-string values to empty strings", () => {
    assert.equal(toTrimmedString(null), "");
    assert.equal(toTrimmedString(undefined), "");
    assert.equal(toTrimmedString(123), "");
    assert.equal(toTrimmedString({}), "");
});

test("string utility helpers interoperate with trimmed strings", () => {
    const values = ["  one  ", "", "  two", "three  ", null];

    const normalized = values.map(toTrimmedString).filter(isNonEmptyString);
    assert.deepEqual(normalized, ["one", "two", "three"]);

    assert.equal(isNonEmptyTrimmedString("  spaced  "), true);
    assert.equal(isNonEmptyTrimmedString("   "), false);
    assert.equal(capitalize("example"), "Example");
});
