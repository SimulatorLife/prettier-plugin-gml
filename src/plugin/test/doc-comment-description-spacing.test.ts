import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("normalizes extra spaces before doc parameter names", async () => {
    const source = [
        "/// @param    x1",
        "/// @param    y1",
        "function draw_line(x1, y1) {",
        "    return x1 + y1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    const [firstParamLine, secondParamLine] = formatted.split("\n");
    assert.equal(firstParamLine, "/// @param x1");
    assert.equal(secondParamLine, "/// @param y1");
});
