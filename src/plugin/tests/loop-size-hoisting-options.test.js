import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES,
    getSizeRetrievalFunctionSuffixes
} from "../src/printer/loop-size-hoisting.js";

test("parses loop length suffix overrides from string lists", () => {
    const overrides = getSizeRetrievalFunctionSuffixes({
        loopLengthHoistFunctionSuffixes:
            "array_length=items\nds_queue_size=count, ds_grid_width=-"
    });

    assert.strictEqual(overrides.get("array_length"), "items");
    assert.strictEqual(overrides.get("ds_queue_size"), "count");
    assert.strictEqual(overrides.has("ds_grid_width"), false);

    assert.strictEqual(
        DEFAULT_SIZE_RETRIEVAL_FUNCTION_SUFFIXES.get("ds_grid_width"),
        "width"
    );
});

test("accepts array inputs when normalizing suffix overrides", () => {
    const overrides = getSizeRetrievalFunctionSuffixes({
        loopLengthHoistFunctionSuffixes: [
            "ds_list_size=items",
            "DS_MAP_SIZE=entries",
            "ds_grid_height=-"
        ]
    });

    assert.strictEqual(overrides.get("ds_list_size"), "items");
    assert.strictEqual(overrides.get("ds_map_size"), "entries");
    assert.strictEqual(overrides.has("ds_grid_height"), false);
});
