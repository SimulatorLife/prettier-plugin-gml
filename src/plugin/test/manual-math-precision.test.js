import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("converts manual mean with floating point noise", async () => {
    const source = [
        "function convert_mean(a, b) {",
        "    return (a + b) * 0.5000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("converts literal square with floating point noise", async () => {
    const source = [
        "function convert_square() {",
        "    return 0.5 * 0.5000000000000001;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_square",
            "function convert_square() {",
            "    return sqr(0.5);",
            "}",
            ""
        ].join("\n")
    );
});

test("preserves inline comments between manual math operands", async () => {
    const source = [
        "function keep_comment(value) {",
        "    return value /* keep */ * value;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function keep_comment",
            "/// @param value",
            "function keep_comment(value) {",
            "    return value /* keep */ * value;",
            "}",
            ""
        ].join("\n")
    );
});

test("converts distance formula with floating point noise", async () => {
    const source = [
        "function convert_distance(x, y) {",
        "    return sqrt((x - 0.5) * (x - 0.5000000000000001) + (y - 2) * (y - 2));",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("condenses chained scalar multipliers into a single coefficient", async () => {
    const source = [
        "function convert_scalar(size) {",
        "    return 1.3 * size * 0.12 / 1.5;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_scalar",
            "/// @param size",
            "function convert_scalar(size) {",
            "    return size * 0.104;",
            "}",
            ""
        ].join("\n")
    );
});

test("condenses subtraction-based scalar multipliers", async () => {
    const source = [
        "function convert_subtracted_scalar(len) {",
        "    return len * (1 - 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_subtracted_scalar",
            "/// @param len",
            "function convert_subtracted_scalar(len) {",
            "    return len * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

test("simplifies negative reciprocal multiplication", async () => {
    const source = [
        "function convert_negative(dx) {",
        "    var result = (dx / -2) * -1;",
        "    return result;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("cancels reciprocal factors paired with their denominator", async () => {
    const source = [
        "function cancel_reciprocal(value_a, value_b) {",
        "    var result = value_a * (1 / value_b) * value_b;",
        "    return result;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("removes additive identity scalars with trailing comments", async () => {
    const source = [
        "function strip_additive_identity(value) {",
        "    return value + 0; // original",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function strip_additive_identity",
            "/// @param value",
            "function strip_additive_identity(value) {",
            "    return value;",
            "}",
            ""
        ].join("\n")
    );
});

test("removes multiplicative zero factors inside additive chains", async () => {
    const source = [
        "function collapse_zero_factor(any_val, offset) {",
        "    return any_val * 0 + offset;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("preserves blank line after removing simplified alias", async () => {
    const source = [
        "function preserve_spacing(x, y) {",
        "    var s11 = y + 0;  // original",
        "    var s11_simplified = y;  // simplified",
        "",
        "    // 12) Double then quarter",
        "    return x * 2 / 4;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function preserve_spacing",
            "/// @param x",
            "/// @param y",
            "function preserve_spacing(x, y) {",
            "    var s11 = y;",
            "",
            "    // 12) Double then quarter",
            "    return x * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

test("condenses chained multipliers with composite operands", async () => {
    const source = [
        "function convert_frames(acc, dt) {",
        "    return acc * dt / 1000 * 60;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("collects shared scalar factors across addition", async () => {
    const source = [
        "function collect_constants(value) {",
        "    return value * 0.3 + value * 0.2;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function collect_constants",
            "/// @param value",
            "function collect_constants(value) {",
            "    return value * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

test("condenses division by reciprocal scalar multipliers", async () => {
    const source = [
        "function convert_reciprocal(x, x0) {",
        "    return (x - x0) / (1 / 60);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("condenses subtraction-only scalar factors", async () => {
    const source = [
        "function convert_subtraction(len) {",
        "    return len * (1 - 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_subtraction",
            "/// @param len",
            "function convert_subtraction(len) {",
            "    return len * 0.5;",
            "}",
            ""
        ].join("\n")
    );
});

test("condenses nested ratios that mix scalar and non-scalar factors", async () => {
    const source = [
        "function convert_percentage(hp, max_hp) {",
        "    return ((hp / max_hp) * 100) / 10;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("cancels reciprocal ratio pairs before scalar condensation", async () => {
    const source = [
        "function cancel_reciprocal(a, b, c) {",
        "    return a * (b / c) * (c / b);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
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

test("cancels numeric identity factors introduced by scalar condensation", async () => {
    const source = [
        "function simplify_scalars(m) {",
        "    return (m / 5) * (10 * 0.5);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function simplify_scalars",
            "/// @param m",
            "function simplify_scalars(m) {",
            "    return m;",
            "}",
            ""
        ].join("\n")
    );
});

test("preserves simple division when no scalar condensation is needed", async () => {
    const source = [
        "function keep_division(room_width, room_height) {",
        "    return room_width / 4 + room_height / 4;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function keep_division",
            "/// @param room_width",
            "/// @param room_height",
            "function keep_division(room_width, room_height) {",
            "    return (room_width / 4) + (room_height / 4);",
            "}",
            ""
        ].join("\n")
    );
});

test("converts multiplicative degree ratios into degtorad", async () => {
    const source = [
        "function convert_degrees(angle) {",
        "    return angle * pi / 180;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertManualMathToBuiltins: true
    });

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function convert_degrees",
            "/// @param angle",
            "function convert_degrees(angle) {",
            "    return degtorad(angle);",
            "}",
            ""
        ].join("\n")
    );
});

test("downgrades numbered triple-slash headings to standard comments", async () => {
    const source = [
        "/// 4) Distributive constant collection",
        "var s4 = value;",
        ""
    ].join("\n");

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        ["// 4) Distributive constant collection", "var s4 = value;", ""].join(
            "\n"
        )
    );
});
