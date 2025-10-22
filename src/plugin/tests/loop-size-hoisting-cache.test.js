import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES,
    getSizeRetrievalFunctionSuffixes
} from "../src/printer/loop-size-hoisting.js";

const LOOP_SIZE_SUFFIX_CACHE = Symbol.for(
    "prettier-plugin-gml.loopLengthHoistFunctionSuffixes"
);

test("caches suffix maps on extensible option bags", () => {
    const options = {};

    const first = getSizeRetrievalFunctionSuffixes(options);
    const second = getSizeRetrievalFunctionSuffixes(options);

    assert.notStrictEqual(first, DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES);
    assert.strictEqual(first, second);
    assert.ok(Object.hasOwn(options, LOOP_SIZE_SUFFIX_CACHE));
    assert.strictEqual(options[LOOP_SIZE_SUFFIX_CACHE], first);
});

test("returns new suffix maps for primitive option inputs", () => {
    const first = getSizeRetrievalFunctionSuffixes(null);
    const second = getSizeRetrievalFunctionSuffixes();
    const third = getSizeRetrievalFunctionSuffixes("value");

    assert.strictEqual(first.get("array_length"), "len");
    assert.strictEqual(second.get("array_length"), "len");
    assert.strictEqual(third.get("array_length"), "len");

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(second, third);
});

test("memoizes suffix maps for frozen option objects", () => {
    const options = Object.freeze({
        loopLengthHoistFunctionSuffixes: "ds_map_size=entries"
    });

    const first = getSizeRetrievalFunctionSuffixes(options);
    const second = getSizeRetrievalFunctionSuffixes(options);

    assert.strictEqual(first.get("ds_map_size"), "entries");
    assert.strictEqual(second.get("ds_map_size"), "entries");
    assert.strictEqual(first, second);
    assert.strictEqual(Object.hasOwn(options, LOOP_SIZE_SUFFIX_CACHE), false);
});
