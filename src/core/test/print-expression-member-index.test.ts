import assert from "node:assert/strict";
import test from "node:test";

import { printExpression } from "../src/ast/print-expression.js";

void test("printExpression renders MemberIndexExpression using index nodes", () => {
    const rendered = printExpression(
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "camMat" },
            index: { type: "Literal", value: 4 }
        },
        ""
    );

    assert.equal(rendered, "camMat[4]");
});

void test("printExpression falls back to property nodes for MemberIndexExpression", () => {
    const rendered = printExpression(
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "camMat" },
            property: { type: "Literal", value: 8 }
        },
        ""
    );

    assert.equal(rendered, "camMat[8]");
});
