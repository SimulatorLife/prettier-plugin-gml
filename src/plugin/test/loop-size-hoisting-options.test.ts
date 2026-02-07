import assert from "node:assert/strict";
import test from "node:test";

import * as Printer from "../src/printer/index.js";

void test("uses opinionated loop length suffix defaults", () => {
    const suffixes = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();

    assert.strictEqual(suffixes.get("array_length"), "len");
    assert.strictEqual(suffixes.get("ds_queue_size"), undefined);
    assert.strictEqual(suffixes.get("ds_grid_width"), "width");
});

void test("returns fresh suffix maps per call", () => {
    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();
    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes();

    assert.notStrictEqual(first, second);

    first.set("array_length", "items");

    assert.strictEqual(second.get("array_length"), "len");
    assert.strictEqual(Printer.LoopSizeHoisting.DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES.get("array_length"), "len");
});

void test("plural array identifiers fall back to bare length suffix", () => {
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("nodes", "len"), "len");
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("bosses", "len"), "len");
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("class", "len"), "class_len");
});
