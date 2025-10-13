import test from "node:test";
import assert from "node:assert/strict";

import { asArray, isNonEmptyArray, toArray } from "../array-utils.js";

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
    assert.deepEqual(toArray(undefined), []);
});

test("asArray returns arrays unchanged", () => {
    const input = [1, 2, 3];
    assert.equal(asArray(input), input);
});

test("asArray normalizes non-arrays to empty arrays", () => {
    assert.deepEqual(asArray(null), []);
    assert.deepEqual(asArray(undefined), []);
    assert.deepEqual(asArray("value"), []);
});

test("isNonEmptyArray identifies arrays with elements", () => {
    assert.equal(isNonEmptyArray([0]), true);
    assert.equal(isNonEmptyArray([]), false);
    assert.equal(isNonEmptyArray(null), false);
});
