import assert from "node:assert/strict";
import test from "node:test";

// Node deprecated the loose equality helpers (for example `assert.equal`).
// These tests intentionally rely on the strict variants so future refactors do
// not reintroduce the legacy assertions. Behaviour has been revalidated via
// `npm test src/shared/test/array-utils.test.js`.

import {
    appendToCollection,
    asArray,
    compactArray,
    isNonEmptyArray,
    pushUnique,
    toArray,
    toArrayFromIterable,
    uniqueArray
} from "../src/utils/array.js";

test("toArray wraps non-array values", () => {
    assert.deepEqual(toArray("value"), ["value"]);
    assert.deepEqual(toArray(0), [0]);
    assert.deepEqual(toArray(false), [false]);
});

test("toArray preserves arrays", () => {
    const input = [1, 2, 3];
    assert.strictEqual(toArray(input), input);
});

test("toArray normalizes nullish values to empty arrays", () => {
    assert.deepEqual(toArray(null), []);
    assert.deepEqual(toArray(), []);
});

test("asArray returns arrays unchanged", () => {
    const input = [1, 2, 3];
    assert.strictEqual(asArray(input), input);
});

test("asArray normalizes non-arrays to empty arrays", () => {
    assert.deepEqual(asArray(null), []);
    assert.deepEqual(asArray(), []);
    assert.deepEqual(asArray("value"), []);
});

test("isNonEmptyArray identifies arrays with elements", () => {
    assert.strictEqual(isNonEmptyArray([0]), true);
    assert.strictEqual(isNonEmptyArray([]), false);
    assert.strictEqual(isNonEmptyArray(null), false);
});

test("uniqueArray removes duplicates while preserving order", () => {
    assert.deepEqual(uniqueArray(["alpha", "beta", "alpha", "gamma", "beta"]), [
        "alpha",
        "beta",
        "gamma"
    ]);
});

test("toArrayFromIterable snapshots arrays before mutation", () => {
    const input = ["alpha", "beta"];

    const snapshot = toArrayFromIterable(input);

    assert.notStrictEqual(snapshot, input);
    assert.deepEqual(snapshot, input);

    snapshot.push("gamma");

    assert.deepEqual(input, ["alpha", "beta"]);
    assert.deepEqual(snapshot, ["alpha", "beta", "gamma"]);
});

test("uniqueArray supports iterables and optional freezing", () => {
    const result = uniqueArray(new Set(["one", "two", "one"]), {
        freeze: true
    });

    assert.deepEqual(result, ["one", "two"]);
    assert.ok(Object.isFrozen(result));
});

test("compactArray removes falsy entries while preserving order", () => {
    assert.deepEqual(compactArray([0, "", "alpha", false, "beta", null]), [
        "alpha",
        "beta"
    ]);
});

test("compactArray tolerates iterables and optional freezing", () => {
    const iterable = new Set(["first", "", "second"]);
    const result = compactArray(iterable, { freeze: true });

    assert.deepEqual(result, ["first", "second"]);
    assert.ok(Object.isFrozen(result));
});

test("compactArray normalizes nullish inputs to empty arrays", () => {
    assert.deepEqual(compactArray(null), []);
    assert.deepEqual(compactArray(), []);
});

test("pushUnique appends values that are not present", () => {
    const entries = ["alpha"];

    const added = pushUnique(entries, "beta");

    assert.strictEqual(added, true);
    assert.deepEqual(entries, ["alpha", "beta"]);
});

test("pushUnique skips existing values", () => {
    const entries = ["alpha", "beta"];

    const added = pushUnique(entries, "alpha");

    assert.strictEqual(added, false);
    assert.deepEqual(entries, ["alpha", "beta"]);
});

test("pushUnique can use a custom equality comparator", () => {
    const entries = [{ id: 1 }, { id: 2 }];

    const added = pushUnique(
        entries,
        { id: 2 },
        { isEqual: (existing, candidate) => existing.id === candidate.id }
    );

    assert.strictEqual(added, false);
    assert.strictEqual(entries.length, 2);
});

test("pushUnique throws when provided a non-array target", () => {
    assert.throws(() => pushUnique(null, "value"), /requires an array/i);
});

test("appendToCollection initializes arrays when accumulator is undefined", () => {
    const result = appendToCollection("alpha");
    assert.deepEqual(result, ["alpha"]);
});

test("appendToCollection appends to existing arrays", () => {
    const accumulator = ["alpha"];
    const result = appendToCollection("beta", accumulator);

    assert.strictEqual(result, accumulator);
    assert.deepEqual(accumulator, ["alpha", "beta"]);
});

test("appendToCollection normalizes scalar accumulators", () => {
    const result = appendToCollection("gamma", "beta");
    assert.deepEqual(result, ["beta", "gamma"]);
});
