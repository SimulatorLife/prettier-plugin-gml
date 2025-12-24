import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("preserves double spaces following doc comment hyphen", async () => {
    const source = [
        "/// @param {real} r -  The radius of the circle",
        "function draw_circle(r) {",
        "    return r;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true
    });

    const [, paramLine] = formatted.split("\n");
    assert.equal(
        paramLine,
        "/// @param {real} r -  The radius of the circle",
        "Expected doc comment description spacing to be preserved"
    );
});

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

    const [firstParamLine, secondParamLine] =
        formatted.split("\n");
    assert.equal(firstParamLine, "/// @param x1");
    assert.equal(secondParamLine, "/// @param y1");
});
