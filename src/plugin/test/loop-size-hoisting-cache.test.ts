import assert from "node:assert/strict";
import test from "node:test";

import * as Printer from "../src/printer/index.js";

void test("caches suffix maps on extensible option bags", () => {
    const options = {};

    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);
    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);

    assert.notStrictEqual(first, Printer.LoopSizeHoisting.DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES);
    assert.strictEqual(first, second);
});

void test("returns new suffix maps for primitive option inputs", () => {
    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(null);
    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();
    const third = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes("value");

    assert.strictEqual(first.get("array_length"), "len");
    assert.strictEqual(second.get("array_length"), "len");
    assert.strictEqual(third.get("array_length"), "len");

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(second, third);
});

void test("memoizes suffix maps for frozen option objects", () => {
    const options = Object.freeze({
        loopLengthHoistFunctionSuffixes: "ds_map_size=entries"
    });

    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);
    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);

    assert.strictEqual(first.get("ds_map_size"), "entries");
    assert.strictEqual(second.get("ds_map_size"), "entries");
    assert.strictEqual(first, second);
});
