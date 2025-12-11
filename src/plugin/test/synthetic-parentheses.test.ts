import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

void test("flatten synthetic addition parentheses from reordered optional parameters", async () => {
    const source = [
        "function example(a, b = 1, c, d = 2) {",
        "    return a + b + c + d;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
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

void test("flattens synthetic addition parentheses by default", async () => {
    const source = ["var value = (a + b + c);", ""].join("\n");

    const formatted = await Plugin.format(source, { parser: "gml-parse" });

    assert.strictEqual(
        formatted.trim(),
        "var value = a + b + c;",
        "Expected redundant addition grouping parentheses inserted by the parser to be removed."
    );
});

void test("omits grouping in longer chains of addition", async () => {
    const source = ["var combined = a + b + c + d + e + f;", ""].join("\n");

    const formatted = await Plugin.format(source, { parser: "gml-parse" });

    assert.strictEqual(
        formatted.trim(),
        "var combined = a + b + c + d + e + f;",
        "Expected longer numeric addition chains to omit redundant synthetic parentheses between operands."
    );
});

void test("flattens additive chains that include call expressions", async () => {
    const source = [
        "var expr = ((x + lengthdir_x(radius, angle)) - lengthdir_x(radius, aa));",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { parser: "gml-parse" });

    assert.strictEqual(
        formatted.trim(),
        "var expr = x + lengthdir_x(radius, angle) - lengthdir_x(radius, aa);",
        "Expected additive chains with call expressions to omit redundant synthetic parentheses."
    );
});

void test("omits extraneous multiplication grouping inside sqrt function", async () => {
    const source = [
        "var length = sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        optimizeMathExpressions: false
    });

    assert.strictEqual(
        formatted.trim(),
        "var length = sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        "Expected multiplication groups inside numeric addition chains to omit redundant synthetic parentheses."
    );
});

void test("flattens chained multiplication operands when optimizeMathExpressions is enabled", async () => {
    const source = [
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = (b.mass * m1) / 4;",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        optimizeMathExpressions: true
    });

    const expectedLines = [
        "/// @function sample",
        "/// @param a",
        "/// @param b",
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = b.mass * m1 * 0.25;",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "Expected chained multiplication to omit redundant synthetic grouping parentheses after division rewrites."
    );
});

void test("keeps division-by-constant grouping when optimizeMathExpressions is disabled", async () => {
    const source = [
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = (b.mass * m1) / 4;",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        optimizeMathExpressions: false
    });

    const expectedLines = [
        "/// @function sample",
        "/// @param a",
        "/// @param b",
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = (b.mass * m1) / 4;",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "Expected division-by-constant groups to keep their explicit parentheses when optimizeMathExpressions is disabled."
    );
});

void test("math optimization is not tied to Feather fixes", async () => {
    const source = [
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = ((b.mass * m1) / 2);",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    const formatted1 = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: false,
        optimizeMathExpressions: true
    });

    const formatted2 = await Plugin.format(source, {
        parser: "gml-parse",
        applyFeatherFixes: true,
        optimizeMathExpressions: true
    });

    const expectedLines = [
        "/// @function sample",
        "/// @param a",
        "/// @param b",
        "function sample(a, b) {",
        "    var m1, r1;",
        "    m1 = 1 / (b.mass + a.mass);",
        "    r1 = b.mass * m1 * 0.5;",
        "    return r1;",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted1.trim(),
        expectedLines.trim(),
        "expected division to be converted to multiplication (without redundant parentheses) when optimizeMathExpressions is enabled, regardless of whether Feather fixes are being applied or not"
    );

    assert.strictEqual(
        formatted2.trim(),
        expectedLines.trim(),
        "Expected division to be converted to multiplication (without redundant parentheses) when optimizeMathExpressions is enabled, regardless of Feather fixes being applied."
    );
});

void test("groups multiplication expressions added together", async () => {
    const source = [
        "function dot(ax, ay, bx, by) {",
        "    return ax * bx + ay * by;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: false
    });

    const expectedLines = [
        "/// @function dot",
        "/// @param ax",
        "/// @param ay",
        "/// @param bx",
        "/// @param by",
        "function dot(ax, ay, bx, by) {",
        "    return (ax * bx) + (ay * by);",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "expected additive chains of multiplication groups outside numeric calls to have synthetic parentheses."
    );
});

void test("optimizes squared products using built-in sqr() function and omits redundant parentheses", async () => {
    const source = [
        "var xoff = a.x - b.x;",
        "var yoff = a.y - b.y;",
        "var actual_dist = (xoff * xoff) + (yoff * yoff);"
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    const expectedLines = [
        "var xoff = a.x - b.x;",
        "var yoff = a.y - b.y;",
        "var actual_dist = sqr(xoff) + sqr(yoff);"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "expected squared calculations outside call arguments to omit redundant multiplication grouping parentheses when using the sqr() built-in"
    );
});

void test("maintains multiplication groups inside a function definition but omits extraneous parentheses layer", async () => {
    const source = [
        "function spring(a, b, dst, force) {",
        "    if (argument_count > 4) {",
        "        push_out = argument[4];",
        "    } else {",
        "        push_out = true;",
        "    }",
        "    var distance = ((xoff * xoff) + (yoff * yoff));",
        "    return distance;",
        "}"
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: false
    });

    const expectedLines = [
        "/// @function spring",
        "/// @param a",
        "/// @param b",
        "/// @param dst",
        "/// @param force",
        "/// @param [push_out=true]",
        "function spring(a, b, dst, force, push_out = true) {",
        "    var distance = (xoff * xoff) + (yoff * yoff);",
        "    return distance;",
        "}"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines.trim(),
        "Expected multiplication groups to flatten inside function definitions, even when optimizeMathExpressions is disabled"
    );
});

void test("preserves chains of sqr calls without additional parentheses", async () => {
    const source = "var ll = sqr(dx) + sqr(dy) + sqr(dz);";

    const formatted = await Plugin.format(source, {
        applyFeatherFixes: true, // Should have no effect here
        optimizeMathExpressions: false
    });
    assert.strictEqual(
        formatted.trim(),
        "var ll = sqr(dx) + sqr(dy) + sqr(dz);",
        "Expected sqr() addition chains to remain untouched by synthetic parentheses normalization."
    );
});

void test("addition grouping is omitted within sqrt calls", async () => {
    const source = [
        "function distance(dir) {",
        "    return sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        optimizeMathExpressions: false
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
        "Expected sqrt() addition chains to omit synthetic parentheses."
    );
});

void test("includes squared comparison grouping within logical expressions", async () => {
    const sourceAndExpected = [
        "var actual_dist = (xoff * xoff) + (yoff * yoff);",
        "if ((actual_dist < (dst * dst) and push_out) or (actual_dist > (dst * dst) and pull_in)) {",
        "    return actual_dist;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(sourceAndExpected, {
        parser: "gml-parse",
        optimizeMathExpressions: false
    });

    assert.strictEqual(
        formatted,
        sourceAndExpected,
        "Expected squared distance comparisons inside logical expressions to include clarifying multiplication grouping."
    );
});

void test("includes synthetic multiplication parentheses within comparisons", async () => {
    const source = [
        "do {",
        "    value += 1;",
        "} until (value > limit * limit);",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse",
        optimizeMathExpressions: false
    });
    const expectedLines = [
        "do {",
        "    value += 1;",
        "} until (value > (limit * limit));"
    ].join("\n");

    assert.strictEqual(
        formatted.trim(),
        expectedLines,
        "Expected multiplication grouping parentheses to be preserved when comparing values, even when functionally redundant."
    );
});

void test("retains synthetic multiplication grouping when subtracting values", async () => {
    const source = [
        "function adjust(xnet, ynet, xx, yy, w, i) {",
        "    return draw_line_width(xnet, ynet, xx, yy, 2 * w - (i * 4));",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        parser: "gml-parse"
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
