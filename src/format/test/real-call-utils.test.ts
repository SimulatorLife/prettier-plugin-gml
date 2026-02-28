import assert from "node:assert/strict";
import { test } from "node:test";

import { getNumericValueFromRealCall } from "../src/printer/real-call-value.js";

function buildRealCall(name, literalValue, skipFlag = true) {
    return {
        type: "CallExpression",
        object: {
            type: "Identifier",
            name
        },
        arguments: [
            {
                type: "Literal",
                value: literalValue
            }
        ]
    };
}

void test("real literal simplification tolerates uppercase callees", () => {
    const node = buildRealCall("REAL", '"123.45"');
    assert.strictEqual(getNumericValueFromRealCall(node), "123.45");
});

void test("real literal simplification tolerates mixed-case callees", () => {
    const node = buildRealCall("ReAl", "'56'");
    assert.strictEqual(getNumericValueFromRealCall(node), "56");
});

void test("real literal simplification handles null node gracefully", () => {
    assert.strictEqual(getNumericValueFromRealCall(null), null);
});

void test("real literal simplification handles undefined node gracefully", () => {
    assert.strictEqual(getNumericValueFromRealCall(undefined), null);
});

void test("real literal simplification handles non-call-expression nodes", () => {
    const node = { type: "Identifier", name: "real" };
    assert.strictEqual(getNumericValueFromRealCall(node), null);
});

void test("real literal simplification handles empty string function name", () => {
    const node = buildRealCall("", '"123"');
    assert.strictEqual(getNumericValueFromRealCall(node), null);
});

void test("real literal simplification handles non-identifier object", () => {
    const node = {
        type: "CallExpression",
        object: { type: "Literal", value: "real" },
        arguments: [{ type: "Literal", value: '"123"' }]
    };
    assert.strictEqual(getNumericValueFromRealCall(node), null);
});
