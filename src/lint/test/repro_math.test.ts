import { test } from "node:test";
import assert from "node:assert";
import * as Core from "@gml-modules/core";
import { optimizeMathExpressionsTransform } from "../src/rules/gml/transforms/optimize-math-expressions.js";
import { applyManualMathNormalization } from "../src/rules/gml/transforms/math/traversal-normalization.js";
import { applyDivisionToMultiplication } from "../src/rules/gml/transforms/math/division-to-multiplication.js";

// Mock options (minimal needed for execution)
const options = {
    sourceText: "",
    originalText: "",
    astRoot: undefined
};

// Helper: Construct AST for `(x - x0) / (1 / 60)`
function createTestAST() {
    // Inner division: 1 / 60
    const innerDiv = {
        type: "BinaryExpression",
        operator: "/",
        left: { type: "Literal", value: 1, raw: "1" },
        right: { type: "Literal", value: 60, raw: "60" }
    };

    // Outer division: (x - x0) / innerDiv
    const outerDiv = {
        type: "BinaryExpression",
        operator: "/",
        left: {
            type: "ParenthesizedExpression",
            expression: {
                type: "BinaryExpression",
                operator: "-",
                left: { type: "Identifier", name: "x" },
                right: { type: "Identifier", name: "x0" }
            }
        },
        right: {
            type: "ParenthesizedExpression",
            expression: innerDiv
        }
    };

    return outerDiv;
}

test("Math Optimization Fix Verification", async (t) => {
    await t.test("Integration: optimizeMathExpressionsTransform runs applyDivisionToMultiplication", () => {
        const ast = createTestAST();

        // This execute function calls applyDivisionToMultiplication internally now.
        // It should convert `... / (1/60)` to `... * 60`.
        // Note: applyDivisionToMultiplication modifies AST in place.
        const result = optimizeMathExpressionsTransform.execute(ast as any, options);

        assert.strictEqual(result.operator, "*");

        const right = result.right as any;
        // Depending on constant folding/normalization order, right side might be 60.
        // If 1/60 becomes 0.01666... BEFORE transform sees it, then transform might fail if it only looks for 1/X.
        // But here we constructed raw AST so it is 1/60.

        // The key fix was ensuring that `applyDivisionToMultiplication` is run.
        // It converts `(1/60)` reciprocal into `* 60`.

        if (right.type === "Literal") {
            assert.strictEqual(String(right.value), "60");
        } else {
            const val = Core.Core.getLiteralNumberValue(right);
            assert.strictEqual(val, 60);
        }
    });

    await t.test("Unit: applyDivisionToMultiplication works directly", () => {
        const ast = createTestAST();

        applyDivisionToMultiplication(ast as any);

        assert.strictEqual(ast.operator, "*");
        const right = ast.right as any;
        if (right.type === "Literal") {
            assert.strictEqual(String(right.value), "60");
        } else {
            const val = Core.Core.getLiteralNumberValue(right);
            assert.strictEqual(val, 60);
        }
    });
});
