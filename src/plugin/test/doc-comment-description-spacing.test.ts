import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import prettier from "prettier";
import { existsSync } from "node:fs";

const __dirname = import.meta.dirname;
const pluginPath = (() => {
    const candidates = [
        path.resolve(__dirname, "../dist/src/index.js"),
        path.resolve(__dirname, "../dist/index.js"),
        path.resolve(__dirname, "../src/index.ts"),
        path.resolve(__dirname, "../src/plugin-entry.ts"),
        path.resolve(__dirname, "../src/index.js"),
        path.resolve(__dirname, "../src/gml.js")
    ];
    return candidates.find((p) => existsSync(p)) || candidates[0];
})();

test("preserves double spaces following doc comment hyphen", async () => {
    const source = [
        "/// @function draw_circle",
        "/// @param {real} r -  The radius of the circle",
        "function draw_circle(r) {",
        "    return r;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const [, paramLine] = formatted.split("\n");
    assert.equal(
        paramLine,
        "/// @param {real} r -  The radius of the circle",
        "Expected doc comment description spacing to be preserved"
    );
});

test("normalizes extra spaces before doc parameter names", async () => {
    const source = [
        "/// @param    x1",
        "/// @param    y1",
        "function draw_line(x1, y1) {",
        "    return x1 + y1;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const [functionLine, firstParamLine, secondParamLine] =
        formatted.split("\n");
    assert.equal(functionLine, "/// @function draw_line");
    assert.equal(firstParamLine, "/// @param x1");
    assert.equal(secondParamLine, "/// @param y1");
});
