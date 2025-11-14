import assert from "node:assert/strict";
import test from "node:test";

import { appendToCollection } from "../src/core/collection-utils.js";

test("appendToCollection initializes arrays when accumulator is undefined", () => {
    const result = appendToCollection("alpha");

    assert.deepEqual(result, ["alpha"]);
});

test("appendToCollection appends to existing arrays", () => {
    const accumulator = ["alpha"];

    const result = appendToCollection("beta", accumulator);

    assert.equal(result, accumulator);
    assert.deepEqual(accumulator, ["alpha", "beta"]);
});

test("appendToCollection normalizes scalar accumulators", () => {
    const result = appendToCollection("gamma", "beta");

    assert.deepEqual(result, ["beta", "gamma"]);
});
