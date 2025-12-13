import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("converts manual mean with floating point noise", async () => {
    const source = [
        "function convert_mean(a, b) {",
        "    return (a + b) * 0.5000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_mean",
            "/// @param a",
            "/// @param b",
            "function convert_mean(a, b) {",
            "    return mean(a, b);",
            "}",
            ""
        ].join("\n")
    );
});

void test("converts literal square with floating point noise", async () => {
    const source = [
        "function convert_square() {",
        "    return 0.5 * 0.5000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_square",
            "function convert_square() {",
            "    return sqr(0.5);",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves inline comments between manual math operands", async () => {
    const source = [
        "function keep_comment(value) {",
        "    return value /* keep */ * value;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function keep_comment",
            "/// @param value",
            "function keep_comment(value) {",
            "    return value /* keep */ * value;",
            "}",
            ""
        ].join("\n")
    );
});

void test("converts distance formula with floating point noise", async () => {
    const source = [
        "function convert_distance(x, y) {",
        "    return sqrt((x - 0.5) * (x - 0.5000000000000001) + (y - 2) * (y - 2));",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_distance",
            "/// @param x",
            "/// @param y",
            "function convert_distance(x, y) {",
            "    return point_distance(0.5, 2, x, y);",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses chained scalar multipliers into a single coefficient", async () => {
    const source = [
        "function convert_scalar(size) {",
        "    return 1.3 * size * 0.12 / 1.5;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_scalar",
            "/// @param size",
            "function convert_scalar(size) {",
            "    return size * 0.104;",
            "}",
            ""
        ].join("\n")
    );
});
void test("promotes lengthdir half-difference assignments into the declaration", async () => {
    const source = [
        "function promote_lengthdir(size, angle) {",
        "    var s = 1.3 * size * 0.12 / 1.5;",
        "    s = s - s / 2 - lengthdir_x(s / 2, angle);",
        "    return s;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function promote_lengthdir",
            "/// @param size",
            "/// @param angle",
            "function promote_lengthdir(size, angle) {",
            "    var s = size * 0.052 * (1 - lengthdir_x(1, angle));",
            "    return s;",
            "}",
            ""
        ].join("\n")
    );
});

void test("combines sequential lengthdir scalar assignments", async () => {
    const source = [
        "function combine_lengthdir(size, angle) {",
        "    var s = 1.3 * size * 0.12 / 1.5;",
        "    s = s - s / 2 - lengthdir_x(s / 2, angle);",
        "    return s;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function combine_lengthdir",
            "/// @param size",
            "/// @param angle",
            "function combine_lengthdir(size, angle) {",
            "    var s = size * 0.052 * (1 - lengthdir_x(1, angle));",
            "    return s;",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves blank line before comments when promoting lengthdir assignments", async () => {
    const source = [
        "function promote_lengthdir_with_comment(size, angle) {",
        "    var s = 1.3 * size * 0.12 / 1.5;",
        "    s = s - s / 2 - lengthdir_x(s / 2, angle);",
        "",
        "    // manual adjustment",
        "    return s;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function promote_lengthdir_with_comment",
            "/// @param size",
            "/// @param angle",
            "function promote_lengthdir_with_comment(size, angle) {",
            "    var s = size * 0.052 * (1 - lengthdir_x(1, angle));",
            "",
            "    // manual adjustment",
            "    return s;",
            "}",
            ""
        ].join("\n")
    );
});

void test("simplifies division by a reciprocal denominator", async () => {
    const source = [
        "function convert_reciprocal(value, denom) {",
        "    return value / (1 / denom);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_reciprocal",
            "/// @param value",
            "/// @param denom",
            "function convert_reciprocal(value, denom) {",
            "    return value * denom;",
            "}",
            ""
        ].join("\n")
    );
});

void test("preserves grouping when simplifying reciprocal denominators with composite factors", async () => {
    const source = [
        "function convert_grouped(value, a, b) {",
        "    return value / (1 / (a + b));",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_grouped",
            "/// @param value",
            "/// @param a",
            "/// @param b",
            "function convert_grouped(value, a, b) {",
            "    return value * (a + b);",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses subtraction-based scalar multipliers", async () => {
    const source = [
        "function convert_subtracted_scalar(len) {",
        "    return len * (1 - 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_subtracted_scalar",
            "/// @param len",
            "function convert_subtracted_scalar(len) {",
            "    return len * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

void test("simplifies negative reciprocal multiplication", async () => {
    const source = [
        "function convert_negative(dx) {",
        "    var result = (dx / -2) * -1;",
        "    return result;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_negative",
            "/// @param dx",
            "function convert_negative(dx) {",
            "    var result = dx * 0.5;",
            "    return result;",
            "}",
            ""
        ].join("\n")
    );
});

void test("cancels reciprocal factors paired with their denominator", async () => {
    const source = [
        "function cancel_reciprocal(value_a, value_b) {",
        "    var result = value_a * (1 / value_b) * value_b;",
        "    return result;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function cancel_reciprocal",
            "/// @param value_a",
            "/// @param value_b",
            "function cancel_reciprocal(value_a, value_b) {",
            "    var result = value_a;",
            "    return result;",
            "}",
            ""
        ].join("\n")
    );
});

void test("removes additive identity scalars with trailing comments", async () => {
    const source = [
        "function strip_additive_identity(value) {",
        "    return value + 0; // original",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function strip_additive_identity",
            "/// @param value",
            "function strip_additive_identity(value) {",
            "    return value; // original",
            "}",
            ""
        ].join("\n")
    );
});

void test("removes multiplicative zero factors inside additive chains", async () => {
    const source = [
        "function collapse_zero_factor(any_val, offset) {",
        "    return any_val * 0 + offset;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function collapse_zero_factor",
            "/// @param any_val",
            "/// @param offset",
            "function collapse_zero_factor(any_val, offset) {",
            "    return offset;",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses chained multipliers with composite operands", async () => {
    const source = [
        "function convert_frames(acc, dt) {",
        "    return acc * dt / 1000 * 60;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_frames",
            "/// @param acc",
            "/// @param dt",
            "function convert_frames(acc, dt) {",
            "    return acc * dt * 0.06;",
            "}",
            ""
        ].join("\n")
    );
});

void test("collects shared scalar factors across addition", async () => {
    const source = [
        "function collect_constants(value) {",
        "    return value * 0.3 + value * 0.2;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function collect_constants",
            "/// @param value",
            "function collect_constants(value) {",
            "    return value * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

void test("reduces shared scalar additions that sum to one", async () => {
    const source = [
        "function normalize_amount(amount) {",
        "    return amount * 0.4 + amount * 0.1 + amount * 0.5;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function normalize_amount",
            "/// @param amount",
            "function normalize_amount(amount) {",
            "    return amount;",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses division by reciprocal scalar multipliers", async () => {
    const source = [
        "function convert_reciprocal(x, x0) {",
        "    return (x - x0) / (1 / 60);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_reciprocal",
            "/// @param x",
            "/// @param x0",
            "function convert_reciprocal(x, x0) {",
            "    return (x - x0) * 60;",
            "}",
            ""
        ].join("\n")
    );
});

void test("optimizes reciprocal assignment expression", async () => {
    const source = [
        "function optimize_assignment(x0, x1) {",
        "    return (x0 - x1) / (1 / 60);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function optimize_assignment",
            "/// @param x0",
            "/// @param x1",
            "function optimize_assignment(x0, x1) {",
            "    return (x0 - x1) * 60;",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses subtraction-only scalar factors", async () => {
    const source = [
        "function convert_subtraction(len) {",
        "    return len * (1 - 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_subtraction",
            "/// @param len",
            "function convert_subtraction(len) {",
            "    return len * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

void test("condenses nested ratios that mix scalar and non-scalar factors", async () => {
    const source = [
        "function convert_percentage(hp, max_hp) {",
        "    return ((hp / max_hp) * 100) / 10;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_percentage",
            "/// @param hp",
            "/// @param max_hp",
            "function convert_percentage(hp, max_hp) {",
            "    return (hp / max_hp) * 10;",
            "}",
            ""
        ].join("\n")
    );
});

void test("cancels reciprocal ratio pairs before scalar condensation", async () => {
    const source = [
        "function cancel_reciprocal(a, b, c) {",
        "    return a * (b / c) * (c / b);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function cancel_reciprocal",
            "/// @param a",
            "/// @param b",
            "/// @param c",
            "function cancel_reciprocal(a, b, c) {",
            "    return a;",
            "}",
            ""
        ].join("\n")
    );
});

void test("simplifies reciprocal products with unit numerators", async () => {
    const source = [
        "function cancel_unit_reciprocal(value_a, value_b) {",
        "    return value_a * (1 / value_b) * value_b;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function cancel_unit_reciprocal",
            "/// @param value_a",
            "/// @param value_b",
            "function cancel_unit_reciprocal(value_a, value_b) {",
            "    return value_a;",
            "}",
            ""
        ].join("\n")
    );
});

void test("cancels numeric identity factors introduced by scalar condensation", async () => {
    const source = [
        "function simplify_scalars(m) {",
        "    return (m / 5) * (10 * 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function simplify_scalars",
            "/// @param m",
            "function simplify_scalars(m) {",
            "    return m;",
            "}",
            ""
        ].join("\n")
    );
});

void test("converts simple division within a function", async () => {
    const source = [
        "function room_division(room_width, room_height) {",
        "    return room_width / 4 + room_height / 4;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function room_division",
            "/// @param room_width",
            "/// @param room_height",
            "function room_division(room_width, room_height) {",
            "    return dot_product(room_width, room_height, 0.25, 0.25);",
            "}",
            ""
        ].join("\n")
    );
});

void test("prioritizes converting multiplicative degree ratios into degtorad over converting division to multiplication", async () => {
    const source = [
        "function convert_degrees(angle) {",
        "    return angle * pi / 180;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function convert_degrees",
            "/// @param angle",
            "function convert_degrees(angle) {",
            "    return degtorad(angle);",
            "}",
            ""
        ].join("\n")
    );
});

void test("downgrades numbered triple-slash comments to standard comments", async () => {
    const source = [
        "/// 4) Distributive constant collection",
        "var s4 = value;",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    const expected = [
        "// 4) Distributive constant collection",
        "var s4 = value;",
        ""
    ].join("\n");

    assert.strictEqual(formatted, expected);
});

void test("uses tolerance-aware comparison for ratio numerator simplification", async () => {
    const source = ["var result = value / 1000 / 60;", ""].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        ["var result = value * 0.000016666666667;", ""].join("\n")
    );
});

void test("safely handles division by denominator near machine epsilon", async () => {
    const source = [
        "function test_tiny_denominator(value) {",
        "    return value / 0.0000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    assert.strictEqual(
        formatted,
        [
            "/// @function test_tiny_denominator",
            "/// @param value",
            "function test_tiny_denominator(value) {",
            "    return value * 10000000000000000;",
            "}",
            ""
        ].join("\n")
    );
});

void test("correctly handles multiplicative chain with near-zero factor", async () => {
    const source = [
        "function chain_with_tiny_factor(x) {",
        "    return x * 2 / 0.000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        optimizeMathExpressions: true
    });

    // The formatter correctly simplifies by converting division to multiplication
    assert.strictEqual(
        formatted,
        [
            "/// @function chain_with_tiny_factor",
            "/// @param x",
            "function chain_with_tiny_factor(x) {",
            "    return x * 2000000000000000;",
            "}",
            ""
        ].join("\n")
    );
});
