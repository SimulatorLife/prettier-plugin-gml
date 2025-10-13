import test from "node:test";
import assert from "node:assert/strict";

import { isNonEmptyArray, toArray } from "../array-utils.js";

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

test("isNonEmptyArray identifies arrays with elements", () => {
    assert.equal(isNonEmptyArray([0]), true);
    assert.equal(isNonEmptyArray([]), false);
    assert.equal(isNonEmptyArray(null), false);
});
