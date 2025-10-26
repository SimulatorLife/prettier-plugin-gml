import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("flatten synthetic addition parentheses from reordered optional parameters", async () => {
    const source = [
        "function example(a, b = 1, c, d = 2) {",
        "    return a + b + c + d;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    const expectedLines = [
        "/// @function example",
        "/// @param a",
        "/// @param [b=1]",
        "/// @param [c]",
        "/// @param [d=2]",
        "function example(a, b = 1, c = undefined, d = 2) {",
        "    return a + b + c + d;",
        "}"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines,
        "Expected optional parameters to be normalized without duplicating parentheses."
    );
});

test("flattens synthetic addition parentheses by default", async () => {
    const source = ["var value = a + b + c;", ""].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var value = a + b + c;",
        "Expected redundant addition grouping parentheses inserted by the parser to be removed."
    );
});

test("flattens longer chains of synthetic addition", async () => {
    const source = ["var combined = a + b + c + d;", ""].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var combined = a + b + c + d;",
        "Expected longer numeric addition chains to omit redundant synthetic parentheses between operands."
    );
});

test("flattens additive chains that include call expressions", async () => {
    const source = [
        "var expr = x + lengthdir_x(radius, angle) - lengthdir_x(radius, aa);",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var expr = x + lengthdir_x(radius, angle) - lengthdir_x(radius, aa);",
        "Expected additive chains with call expressions to omit redundant synthetic parentheses."
    );
});

test("flattens numeric multiplication groups inside addition chains", async () => {
    const source = [
        "var length = sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var length = sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        "Expected multiplication groups inside numeric addition chains to omit redundant synthetic parentheses."
    );
});

test("flattens standalone multiplication groups added together", async () => {
    const source = [
        "function dot(ax, ay, bx, by) {",
        "    return ax * bx + ay * by;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expectedLines = [
        "/// @function dot",
        "/// @param ax",
        "/// @param ay",
        "/// @param bx",
        "/// @param by",
        "function dot(ax, ay, bx, by) {",
        "    return ax * bx + ay * by;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "Expected additive chains of multiplication groups outside numeric calls to omit redundant synthetic parentheses."
    );
});

test("flattens squared distance additions outside numeric calls", async () => {
    const source = ["var actual_dist = xoff * xoff + yoff * yoff;", ""].join(
        "\n"
    );

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var actual_dist = xoff * xoff + yoff * yoff;",
        "Expected squared offset additions outside numeric calls to omit redundant synthetic parentheses."
    );
});

test("preserves chains of sqr calls without additional parentheses", async () => {
    const source = ["var ll = sqr(dx) + sqr(dy) + sqr(dz);", ""].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted.trim(),
        "var ll = sqr(dx) + sqr(dy) + sqr(dz);",
        "Expected sqr() addition chains to remain untouched by synthetic parentheses normalization."
    );
});

test("flattens synthetic addition within sqrt calls", async () => {
    const source = [
        "function distance(dir) {",
        "    return sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expectedLines = [
        "/// @function distance",
        "/// @param dir",
        "function distance(dir) {",
        "    return sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        "}"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines,
        "Expected sqrt() addition chains to omit redundant synthetic parentheses."
    );
});

test("retains synthetic multiplication parentheses within comparisons", async () => {
    const source = [
        "do {",
        "    value += 1;",
        "} until (value > limit * limit);",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expectedLines = [
        "do {",
        "    value += 1;",
        "} until (value > (limit * limit));"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines,
        "Expected multiplication grouping parentheses to be preserved when comparing values."
    );
});

test("retains synthetic multiplication grouping when subtracting values", async () => {
    const source = [
        "function adjust(xnet, ynet, xx, yy, w, i) {",
        "    return draw_line_width(xnet, ynet, xx, yy, 2 * w - (i * 4));",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expectedLines = [
        "/// @function adjust",
        "/// @param xnet",
        "/// @param ynet",
        "/// @param xx",
        "/// @param yy",
        "/// @param w",
        "/// @param i",
        "function adjust(xnet, ynet, xx, yy, w, i) {",
        "    return draw_line_width(xnet, ynet, xx, yy, (2 * w) - (i * 4));",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "Expected subtraction chains to preserve multiplication grouping parentheses."
    );
});
