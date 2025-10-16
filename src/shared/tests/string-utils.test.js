import test from "node:test";
import assert from "node:assert/strict";

// Prefer strict assertion helpers to avoid relying on Node.js' deprecated
// loose equality variants like assert.equal/assert.deepEqual.

import {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isWordChar,
    toTrimmedString,
    toNormalizedLowerCaseString,
    toNormalizedLowerCaseSet,
    capitalize,
    getNonEmptyString,
    normalizeStringList
} from "../string-utils.js";

test("toTrimmedString returns trimmed strings", () => {
    assert.strictEqual(toTrimmedString("  value  "), "value");
    assert.strictEqual(toTrimmedString("value"), "value");
    assert.strictEqual(toTrimmedString(""), "");
});

test("toTrimmedString normalizes non-string values to empty strings", () => {
    assert.strictEqual(toTrimmedString(null), "");
    assert.strictEqual(toTrimmedString(), "");
    assert.strictEqual(toTrimmedString(123), "");
    assert.strictEqual(toTrimmedString({}), "");
});

test("toNormalizedLowerCaseString trims and lowercases input values", () => {
    assert.strictEqual(toNormalizedLowerCaseString("  JSON  "), "json");
    assert.strictEqual(toNormalizedLowerCaseString("Human"), "human");
    assert.strictEqual(toNormalizedLowerCaseString(123), "123");
});

test("toNormalizedLowerCaseString tolerates nullish inputs", () => {
    assert.strictEqual(toNormalizedLowerCaseString(null), "");
    assert.strictEqual(toNormalizedLowerCaseString(), "");
    assert.strictEqual(toNormalizedLowerCaseString("   "), "");
});

test("string utility helpers interoperate with trimmed strings", () => {
    const values = ["  one  ", "", "  two", "three  ", null];

    const normalized = values
        .map((value) => toTrimmedString(value))
        .filter((value) => isNonEmptyString(value));
    assert.deepStrictEqual(normalized, ["one", "two", "three"]);

    assert.strictEqual(isNonEmptyTrimmedString("  spaced  "), true);
    assert.strictEqual(isNonEmptyTrimmedString("   "), false);
    assert.strictEqual(capitalize("example"), "Example");
});

test("getNonEmptyString returns null for empty candidates", () => {
    assert.strictEqual(getNonEmptyString("value"), "value");
    assert.strictEqual(getNonEmptyString(""), null);
    assert.strictEqual(getNonEmptyString(null), null);
    assert.strictEqual(getNonEmptyString(), null);
});

test("toNormalizedLowerCaseSet trims, deduplicates, and lowercases entries", () => {
    const values = ["  Foo  ", "BAR", "foo", null, "   "];
    const result = toNormalizedLowerCaseSet(values);
    assert.deepStrictEqual([...result], ["foo", "bar"]);
});

test("toNormalizedLowerCaseSet tolerates invalid inputs when allowed", () => {
    assert.deepStrictEqual([...toNormalizedLowerCaseSet(null)], []);
    assert.deepStrictEqual([...toNormalizedLowerCaseSet()], []);
    assert.deepStrictEqual([...toNormalizedLowerCaseSet(42)], []);
});

test("capitalize leaves falsy and non-string inputs unchanged", () => {
    assert.strictEqual(capitalize(""), "");
    assert.strictEqual(capitalize(null), null);
    assert.strictEqual(capitalize(), undefined);
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

test("normalizeStringList trims entries, removes exact duplicates, and skips invalid inputs", () => {
    const values = ["  foo  ", "bar", " ", "foo", "Foo", 42, "baz  "];
    const normalized = normalizeStringList(values);
    assert.deepStrictEqual(normalized, ["foo", "bar", "Foo", "baz"]);

    assert.deepStrictEqual(normalizeStringList("a, b ,a"), ["a", "b"]);
    assert.deepStrictEqual(normalizeStringList(null), []);
});
