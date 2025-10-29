import assert from "node:assert/strict";
import test from "node:test";

// Prefer strict assertion helpers to avoid relying on Node.js' deprecated
// loose equality variants like assert.equal/assert.deepEqual.

import {
    assertNonEmptyString,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isWordChar,
    toTrimmedString,
    coalesceTrimmedString,
    toNormalizedLowerCaseString,
    toNormalizedLowerCaseSet,
    normalizeStringList,
    capitalize,
    getNonEmptyString,
    stripStringQuotes,
    createListSplitPattern
} from "../src/utils/string.js";

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

test("coalesceTrimmedString returns the first non-empty trimmed candidate", () => {
    assert.strictEqual(coalesceTrimmedString(null, "   ", "value"), "value");
    assert.strictEqual(coalesceTrimmedString("  first  ", "second"), "first");
    assert.strictEqual(coalesceTrimmedString(), "");
    assert.strictEqual(coalesceTrimmedString(null, "   "), "");
});

test("normalizeStringList preserves entire strings when splitting is disabled", () => {
    assert.deepStrictEqual(
        normalizeStringList("alpha,beta", { splitPattern: null }),
        ["alpha,beta"]
    );
    assert.deepStrictEqual(
        normalizeStringList("alpha,beta", { splitPattern: false }),
        ["alpha,beta"]
    );
});

test("createListSplitPattern deduplicates separators and preserves order", () => {
    const pattern = createListSplitPattern([",", ":", ","]);
    assert.deepStrictEqual("alpha,beta:gamma".split(pattern), [
        "alpha",
        "beta",
        "gamma"
    ]);
});

test("createListSplitPattern supports multi-character separators", () => {
    const pattern = createListSplitPattern(["::", "ab"]);
    assert.deepStrictEqual("one::twoabthree".split(pattern), [
        "one",
        "two",
        "three"
    ]);
});

test("createListSplitPattern optionally includes whitespace separators", () => {
    const pattern = createListSplitPattern([","], { includeWhitespace: true });
    assert.deepStrictEqual("one, two  three".split(pattern), [
        "one",
        "two",
        "three"
    ]);
});

test("createListSplitPattern requires a separator when whitespace is disabled", () => {
    assert.throws(() => createListSplitPattern([]), TypeError);
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

test("assertNonEmptyString returns the validated value", () => {
    assert.strictEqual(assertNonEmptyString("value"), "value");
    assert.strictEqual(
        assertNonEmptyString("  padded  ", { trim: true }),
        "padded"
    );
});

test("assertNonEmptyString throws when value is not a non-empty string", () => {
    assert.throws(() => assertNonEmptyString(""), TypeError);
    assert.throws(() => assertNonEmptyString("   ", { trim: true }), TypeError);
    assert.throws(() => assertNonEmptyString(null), TypeError);
    assert.throws(() => assertNonEmptyString(42), TypeError);
});

test("stripStringQuotes removes matching single and double quotes", () => {
    assert.strictEqual(stripStringQuotes('"value"'), "value");
    assert.strictEqual(stripStringQuotes("'value'"), "value");
    assert.strictEqual(stripStringQuotes('""'), "");
});

test("stripStringQuotes returns null for unquoted or mismatched values", () => {
    assert.strictEqual(stripStringQuotes("value"), null);
    assert.strictEqual(stripStringQuotes("\"value'"), null);
    assert.strictEqual(stripStringQuotes("'value\""), null);
    assert.strictEqual(stripStringQuotes(null), null);
    assert.strictEqual(stripStringQuotes(42), null);
});
