import assert from "node:assert/strict";
import test from "node:test";

import {
    asArray,
    cloneObjectEntries,
    isNonEmptyArray,
    pushUnique,
    toArray,
    uniqueArray
} from "../array-utils.js";

test("toArray wraps non-array values", () => {
    assert.deepEqual(toArray("value"), ["value"]);
    assert.deepEqual(toArray(0), [0]);
    assert.deepEqual(toArray(false), [false]);
});

test("toArray preserves arrays", () => {
    const input = [1, 2, 3];
    assert.equal(toArray(input), input);
});

test("toArray normalizes nullish values to empty arrays", () => {
    assert.deepEqual(toArray(null), []);
    assert.deepEqual(toArray(), []);
});

test("asArray returns arrays unchanged", () => {
    const input = [1, 2, 3];
    assert.equal(asArray(input), input);
});

test("asArray normalizes non-arrays to empty arrays", () => {
    assert.deepEqual(asArray(null), []);
    assert.deepEqual(asArray(), []);
    assert.deepEqual(asArray("value"), []);
});

test("isNonEmptyArray identifies arrays with elements", () => {
    assert.equal(isNonEmptyArray([0]), true);
    assert.equal(isNonEmptyArray([]), false);
    assert.equal(isNonEmptyArray(null), false);
});

test("uniqueArray removes duplicates while preserving order", () => {
    assert.deepEqual(uniqueArray(["alpha", "beta", "alpha", "gamma", "beta"]), [
        "alpha",
        "beta",
        "gamma"
    ]);
});

test("uniqueArray supports iterables and optional freezing", () => {
    const result = uniqueArray(new Set(["one", "two", "one"]), {
        freeze: true
    });

    assert.deepEqual(result, ["one", "two"]);
    assert.ok(Object.isFrozen(result));
});

test("pushUnique appends values that are not present", () => {
    const entries = ["alpha"];

    const added = pushUnique(entries, "beta");

    assert.equal(added, true);
    assert.deepEqual(entries, ["alpha", "beta"]);
});

test("pushUnique skips existing values", () => {
    const entries = ["alpha", "beta"];

    const added = pushUnique(entries, "alpha");

    assert.equal(added, false);
    assert.deepEqual(entries, ["alpha", "beta"]);
});

test("pushUnique can use a custom equality comparator", () => {
    const entries = [{ id: 1 }, { id: 2 }];

    const added = pushUnique(
        entries,
        { id: 2 },
        { isEqual: (existing, candidate) => existing.id === candidate.id }
    );

    assert.equal(added, false);
    assert.equal(entries.length, 2);
});

test("pushUnique throws when provided a non-array target", () => {
    assert.throws(() => pushUnique(null, "value"), /requires an array/i);
});

test("cloneObjectEntries shallowly clones object entries", () => {
    const original = [{ value: 1 }, { value: 2 }];
    const cloned = cloneObjectEntries(original);

    assert.notEqual(cloned, original);
    assert.deepEqual(cloned, original);
    assert.notEqual(cloned[0], original[0]);
    assert.notEqual(cloned[1], original[1]);
});

test("cloneObjectEntries preserves non-object entries", () => {
    const original = [1, null, "text"];
    const cloned = cloneObjectEntries(original);

    assert.deepEqual(cloned, original);
    assert.strictEqual(cloned[0], original[0]);
    assert.strictEqual(cloned[1], original[1]);
    assert.strictEqual(cloned[2], original[2]);
});

test("cloneObjectEntries normalizes nullish input to empty arrays", () => {
    assert.deepEqual(cloneObjectEntries(null), []);
    assert.deepEqual(cloneObjectEntries(), []);
});
