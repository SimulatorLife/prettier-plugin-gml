import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

test("retains argument aliases when no parameters are declared", async () => {
    const source = [
        "/// @function sample",
        "/// @param first",
        "function sample() {",
        "    var first = argument0;",
        "    return argument0;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    assert.strictEqual(
        formatted,
        [
            "/// @function sample",
            "/// @param first",
            "function sample() {",
            "    var first = argument0;",
            "    return argument0;",
            "}",
            ""
        ].join("\n")
    );
});
