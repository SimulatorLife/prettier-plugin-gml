import assert from "node:assert/strict";
import test from "node:test";

import { getNodeType } from "../ast/node-helpers.js";

test("getNodeType returns the type string for node objects", () => {
    const node = { type: "CallExpression", value: 42 };
    assert.strictEqual(getNodeType(node), "CallExpression");
});

test("getNodeType returns null when the type property is missing or invalid", () => {
    assert.strictEqual(getNodeType({}), null);
    assert.strictEqual(getNodeType({ type: 123 }), null);
});

test("getNodeType returns null for non-object values", () => {
    assert.strictEqual(getNodeType(null), null);
    assert.strictEqual(getNodeType(), null);
    assert.strictEqual(getNodeType("Identifier"), null);
});
