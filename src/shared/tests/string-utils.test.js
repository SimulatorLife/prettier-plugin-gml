import test from "node:test";
import assert from "node:assert/strict";

// Prefer strict assertion helpers to avoid relying on Node.js' deprecated
// loose equality variants like assert.equal/assert.deepEqual.

import {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isWordChar,
    toTrimmedString,
    capitalize
} from "../string-utils.js";

test("toTrimmedString returns trimmed strings", () => {
    assert.strictEqual(toTrimmedString("  value  "), "value");
    assert.strictEqual(toTrimmedString("value"), "value");
    assert.strictEqual(toTrimmedString(""), "");
});

test("toTrimmedString normalizes non-string values to empty strings", () => {
    assert.strictEqual(toTrimmedString(null), "");
    assert.strictEqual(toTrimmedString(undefined), "");
    assert.strictEqual(toTrimmedString(123), "");
    assert.strictEqual(toTrimmedString({}), "");
});

test("string utility helpers interoperate with trimmed strings", () => {
    const values = ["  one  ", "", "  two", "three  ", null];

    const normalized = values.map(toTrimmedString).filter(isNonEmptyString);
    assert.deepStrictEqual(normalized, ["one", "two", "three"]);

    assert.strictEqual(isNonEmptyTrimmedString("  spaced  "), true);
    assert.strictEqual(isNonEmptyTrimmedString("   "), false);
    assert.strictEqual(capitalize("example"), "Example");
});

test("capitalize leaves falsy and non-string inputs unchanged", () => {
    assert.strictEqual(capitalize(""), "");
    assert.strictEqual(capitalize(null), null);
    assert.strictEqual(capitalize(undefined), undefined);
    assert.strictEqual(capitalize(42), 42);
});

test("isWordChar validates alphanumeric and underscore characters", () => {
    assert.strictEqual(isWordChar("a"), true);
    assert.strictEqual(isWordChar("Z"), true);
    assert.strictEqual(isWordChar("0"), true);
    assert.strictEqual(isWordChar("_"), true);
    assert.strictEqual(isWordChar(""), false);
    assert.strictEqual(isWordChar("-"), false);
    assert.strictEqual(isWordChar(null), false);
});
