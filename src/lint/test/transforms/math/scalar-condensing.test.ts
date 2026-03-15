import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyScalarCondensing } from "../../../src/rules/gml/transforms/math/index.js";

void describe("applyScalarCondensing", () => {
    // applyScalarCondensing is a stub pending full implementation;
    // once implemented it should combine numeric scalar factors as tested here.
    void it("combines numeric scalar factors", { skip: "applyScalarCondensing is not yet implemented" }, () => {
        const ast: any = {
            type: "BinaryExpression",
            operator: "*",
            left: {
                type: "BinaryExpression",
                operator: "*",
                left: { type: "Identifier", name: "foo" },
                right: { type: "Literal", value: "2" }
            },
            right: { type: "Literal", value: "3" }
        };

        applyScalarCondensing(ast, null);

        assert.strictEqual(ast.type, "BinaryExpression");
        assert.strictEqual(ast.left.type, "Identifier");
        assert.strictEqual(ast.left.name, "foo");
        assert.strictEqual(ast.right.type, "Literal");
        assert.strictEqual(ast.right.value, "6");
    });
});
