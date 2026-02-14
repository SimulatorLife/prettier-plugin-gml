import assert from "node:assert/strict";
import test from "node:test";

import * as Printer from "../src/printer/index.js";

void test("creates new suffix maps for each request", () => {
    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();
    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first, Printer.LoopSizeHoisting.DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES);
});

void test("keeps the opinionated default suffixes intact", () => {
    const suffixes = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();

    assert.strictEqual(suffixes.get("array_length"), "len");
    assert.strictEqual(suffixes.get("ds_list_size"), "size");
    assert.strictEqual(suffixes.get("ds_map_size"), "size");
    assert.strictEqual(suffixes.get("ds_grid_width"), "width");
    assert.strictEqual(suffixes.get("ds_grid_height"), "height");
});
