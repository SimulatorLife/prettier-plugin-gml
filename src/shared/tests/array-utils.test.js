import assert from "node:assert/strict";
import test from "node:test";

import {
    asArray,
    isNonEmptyArray,
    pushUnique,
    toArray,
    uniqueArray
} from "../utils/array.js";

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
