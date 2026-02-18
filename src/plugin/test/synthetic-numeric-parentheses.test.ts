import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("omits synthetic multiplicative parentheses inside additive expressions", async () => {
    const source = "var actual_dist = xoff * xoff + yoff * yoff;\n";
    const formatted = await Plugin.format(source);

    assert.equal(formatted, "var actual_dist = xoff * xoff + yoff * yoff;\n");
});

void test("omits synthetic multiplicative parentheses in comparison operands", async () => {
    const source =
        "if ((actual_dist < dst * dst and push_out) or (actual_dist > dst * dst and pull_in)) {\n    exit;\n}\n";
    const formatted = await Plugin.format(source);

    assert.equal(
        formatted,
        "if ((actual_dist < dst * dst and push_out) or (actual_dist > dst * dst and pull_in)) {\n    exit;\n}\n"
    );
});
