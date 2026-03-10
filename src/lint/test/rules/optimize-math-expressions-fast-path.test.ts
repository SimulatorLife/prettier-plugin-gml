import assert from "node:assert/strict";
import { test } from "node:test";

import { lintWithRule } from "./lint-rule-test-harness.js";

void test("optimize-math-expressions rewrites additive product chains to dot_product helpers", () => {
    const input = ["result3d = a * b + c * d + e * f;", "result2d = g * h + i * j;", ""].join("\n");

    const result = lintWithRule("optimize-math-expressions", input, {});

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]?.messageId, "optimizeMathExpressions");
    assert.equal(
        result.output,
        ["result3d = dot_product_3d(a, c, e, b, d, f);", "result2d = dot_product(g, i, h, j);", ""].join("\n")
    );
});

void test("optimize-math-expressions preserves square-product simplifications without forcing dot_product", () => {
    const input = "result = a * a + b * b + c * c;\n";
    const result = lintWithRule("optimize-math-expressions", input, {});

    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]?.messageId, "optimizeMathExpressions");
    assert.equal(result.output, "result = (sqr(a) + sqr(b)) + sqr(c);\n");
    assert.equal(result.output.includes("dot_product"), false);
});
