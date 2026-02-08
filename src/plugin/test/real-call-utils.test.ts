import assert from "node:assert/strict";
import { test } from "node:test";

import { getNumericValueFromRealCall } from "../src/printer/call-expressions/real-call-value.js";

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
                value: literalValue,
                _skipNumericStringCoercion: skipFlag
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

void test("real literal simplification skips when coercion flag missing", () => {
    const node = buildRealCall("real", '"789"', false);
    assert.strictEqual(getNumericValueFromRealCall(node), null);
});
