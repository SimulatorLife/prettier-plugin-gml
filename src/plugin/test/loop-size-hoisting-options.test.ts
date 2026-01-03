import assert from "node:assert/strict";
import test from "node:test";

import * as Printer from "../src/printer/index.js";

void test("parses loop length suffix overrides from string lists", () => {
    const overrides = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes({
        loopLengthHoistFunctionSuffixes: "array_length=items\nds_queue_size=count, ds_grid_width=-"
    });

    assert.strictEqual(overrides.get("array_length"), "items");
    assert.strictEqual(overrides.get("ds_queue_size"), "count");
    assert.strictEqual(overrides.has("ds_grid_width"), false);

    assert.strictEqual(Printer.LoopSizeHoisting.DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES.get("ds_grid_width"), "width");
});

void test("accepts array inputs when normalizing suffix overrides", () => {
    const overrides = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes({
        loopLengthHoistFunctionSuffixes: ["ds_list_size=items", "DS_MAP_SIZE=entries", "ds_grid_height=-"]
    });

    assert.strictEqual(overrides.get("ds_list_size"), "items");
    assert.strictEqual(overrides.get("ds_map_size"), "entries");
    assert.strictEqual(overrides.has("ds_grid_height"), false);
});

void test("memoizes suffix overrides per options object", () => {
    const options = {
        loopLengthHoistFunctionSuffixes: "ds_list_size=items"
    };

    const first = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);

    options.loopLengthHoistFunctionSuffixes = "ds_list_size=count";

    const second = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(options);

    assert.strictEqual(first, second);
    assert.strictEqual(second.get("ds_list_size"), "items");

    const otherOptions = {
        loopLengthHoistFunctionSuffixes: "ds_list_size=count"
    };

    const third = Printer.LoopSizeHoisting.getSizeRetrievalFunctionSuffixes(otherOptions);

    assert.notStrictEqual(second, third);
    assert.strictEqual(third.get("ds_list_size"), "count");
});

void test("plural array identifiers fall back to bare length suffix", () => {
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("nodes", "len"), "len");
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("bosses", "len"), "len");
    assert.strictEqual(Printer.LoopSizeHoisting.buildCachedSizeVariableName("class", "len"), "class_len");
});
