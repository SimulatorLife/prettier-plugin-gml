import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("retains numbered arguments", async () => {
    const source = [
        "/// @param first",
        "function sample() {",
        "    var first = argument0;",
        "    return argument0;",
        "}",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(
        formatted,
        [
            "/// @param first",
            "function sample() {",
            "    var first = argument0;",
            "    return argument0;",
            "}",
            ""
        ].join("\n")
    );
});
