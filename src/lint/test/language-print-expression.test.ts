import assert from "node:assert/strict";
import test from "node:test";

import { printExpression } from "../src/language/print-expression.js";

void test("printExpression renders MemberIndexExpression using index nodes", () => {
    const rendered = printExpression(
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "arr" },
            index: { type: "Identifier", name: "i" }
        },
        ""
    );

    assert.equal(rendered, "arr[i]");
});

void test("printExpression falls back to property nodes for MemberIndexExpression", () => {
    const rendered = printExpression(
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "arr" },
            property: { type: "Identifier", name: "j" }
        },
        ""
    );

    assert.equal(rendered, "arr[j]");
});

void test("printExpression renders parser-style property arrays for MemberIndexExpression", () => {
    const rendered = printExpression(
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "arr" },
            property: [{ type: "Identifier", name: "k" }]
        },
        ""
    );

    assert.equal(rendered, "arr[k]");
});
