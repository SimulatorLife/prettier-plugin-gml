import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyManualMathNormalization } from "../../src/rules/gml/transforms/math/index.js";

void describe("applyManualMathNormalization", () => {
    void it("removes multiplicative identity operands", () => {
        const ast: any = {
            type: "BinaryExpression",
            operator: "*",
            left: { type: "Literal", value: "1" },
            right: { type: "Identifier", name: "foo" }
        };

        applyManualMathNormalization(ast, null);

        assert.strictEqual(ast.type, "Identifier");
        assert.strictEqual(ast.name, "foo");
        assert.strictEqual(ast.__fromMultiplicativeIdentity, true);
    });

    void it("wraps the base identifier in unary negation when distributed scalar coefficients sum to -1", () => {
        // Represents: (3 * x) + ((-4) * x) → coefficient = 3 + (-4) = -1 → -x
        const ast: any = {
            type: "BinaryExpression",
            operator: "+",
            left: {
                type: "BinaryExpression",
                operator: "*",
                left: { type: "Literal", value: "3" },
                right: { type: "Identifier", name: "x" }
            },
            right: {
                type: "BinaryExpression",
                operator: "*",
                left: {
                    type: "UnaryExpression",
                    operator: "-",
                    prefix: true,
                    argument: { type: "Literal", value: "4" }
                },
                right: { type: "Identifier", name: "x" }
            }
        };

        applyManualMathNormalization(ast, null);

        assert.strictEqual(ast.type, "UnaryExpression");
        assert.strictEqual(ast.operator, "-");
        assert.strictEqual(ast.prefix, true);
        assert.strictEqual(ast.argument.type, "Identifier");
        assert.strictEqual(ast.argument.name, "x");
    });
});
