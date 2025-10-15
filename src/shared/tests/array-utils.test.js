import test from "node:test";
import assert from "node:assert/strict";

import {
    asArray,
    isNonEmptyArray,
    mergeUniqueValues,
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

test("mergeUniqueValues returns a frozen copy when no additions are provided", () => {
    const defaults = Object.freeze(["alpha", "beta"]);
    const merged = mergeUniqueValues(defaults, null);

    assert.notEqual(merged, defaults);
    assert.deepEqual(merged, defaults);
    assert.ok(Object.isFrozen(merged));
});

test("mergeUniqueValues appends unique coerced values", () => {
    const defaults = Object.freeze([/foo/]);
    const merged = mergeUniqueValues(
        defaults,
        ["/bar/i", "/foo/", "", null, /baz/],
        {
            coerce: (value) => {
                if (value instanceof RegExp) {
                    return value;
                }

                if (typeof value !== "string") {
                    return null;
                }

                const trimmed = value.trim();
                if (!trimmed) {
                    return null;
                }

                const match = trimmed.match(/^\/(.*)\/([a-z]*)$/i);
                if (!match) {
                    return null;
                }

                const [, source, flags = ""] = match;
                return new RegExp(source, flags);
            },
            getKey: (pattern) => pattern.toString()
        }
    );

    assert.deepEqual(
        merged.map((pattern) => pattern.toString()),
        ["/foo/", "/bar/i", "/baz/"]
    );
});
