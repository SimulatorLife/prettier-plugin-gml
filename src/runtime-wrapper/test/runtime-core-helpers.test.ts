import assert from "node:assert/strict";
import test from "node:test";

import {
    areNumbersApproximatelyEqual,
    cloneObjectEntries,
    isErrorLike,
    isNonEmptyString,
    toArray
} from "../src/runtime/runtime-core-helpers.js";

void test("toArray normalizes nullable and scalar inputs", () => {
    assert.deepEqual(toArray(), []);
    assert.deepEqual(toArray(null), []);
    assert.deepEqual(toArray("value"), ["value"]);

    const arrayInput = [1, 2, 3];
    assert.strictEqual(toArray(arrayInput), arrayInput, "Should preserve array identity");
});

void test("isNonEmptyString only matches populated strings", () => {
    assert.ok(isNonEmptyString("foo"));
    assert.strictEqual(isNonEmptyString(""), false);
    assert.strictEqual(isNonEmptyString(null), false);
    assert.strictEqual(isNonEmptyString(123), false);
});

void test("areNumbersApproximatelyEqual respects scaled tolerance", () => {
    const nearDelta = Number.EPSILON * 2;
    assert.ok(areNumbersApproximatelyEqual(1, 1 + nearDelta));
    assert.strictEqual(areNumbersApproximatelyEqual(1, 1 + 0.1), false);
    assert.strictEqual(areNumbersApproximatelyEqual(Number.NaN, 1), false);
});

void test("isErrorLike guards message and optional name shape", () => {
    assert.ok(isErrorLike(new Error("boom")));
    assert.ok(isErrorLike({ message: "custom" }));
    assert.ok(isErrorLike({ message: "custom", name: "CustomError" }));
    assert.strictEqual(isErrorLike({}), false);
    assert.strictEqual(isErrorLike({ message: 123 }), false);
    assert.strictEqual(isErrorLike({ message: "msg", name: 123 }), false);
});

void test("cloneObjectEntries shallowly clones object-like entries", () => {
    const entries = [{ value: 1 }, { value: 2 }, 3];
    const cloned = cloneObjectEntries(entries);

    assert.deepEqual(cloned[0], entries[0]);
    assert.notStrictEqual(cloned[0], entries[0]);
    assert.strictEqual(cloned[2], 3);

    assert.deepEqual(cloneObjectEntries(null), []);
    assert.deepEqual(cloneObjectEntries([]), []);
});
