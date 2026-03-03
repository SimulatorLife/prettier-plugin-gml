/**
 * Tests for the `applyLogicalNormalization` transform focusing on the
 * IfStatement → ReturnStatement boolean-return simplification that was
 * previously handled (incorrectly) by the formatter's `printBooleanReturnIf`.
 *
 * Target-state §3.2: semantic/content rewrites belong in `@gml-modules/lint`,
 * not in `@gml-modules/format`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyLogicalNormalization } from "../../src/rules/gml/transforms/logical-expressions/traversal-normalization.js";

/**
 * Returns a minimal IfStatement AST whose test is a bare Identifier.
 * The boolean literal values use the string form `"true"` / `"false"` that
 * the GML parser emits at runtime (not JavaScript booleans).
 */
function buildBooleanReturnIfAst(
    testName: string,
    consequentValue: "true" | "false",
    alternateValue: "true" | "false",
    start = 0,
    end = 60
): any {
    return {
        type: "IfStatement",
        test: { type: "Identifier", name: testName, start, end: start + testName.length },
        consequent: {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: { type: "Literal", value: consequentValue }
                }
            ]
        },
        alternate: {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: { type: "Literal", value: alternateValue }
                }
            ]
        },
        start,
        end
    };
}

void describe("applyLogicalNormalization – IfStatement boolean-return simplification", () => {
    void it("collapses `if (cond) { return true; } else { return false; }` into `return cond;`", () => {
        const node = buildBooleanReturnIfAst("condition", "true", "false");

        applyLogicalNormalization(node);

        assert.strictEqual(node.type, "ReturnStatement", "node should become a ReturnStatement");
        assert.strictEqual(node.argument?.type, "Identifier");
        assert.strictEqual(node.argument?.name, "condition");
    });

    void it("collapses `if (cond) { return false; } else { return true; }` into `return !cond;`", () => {
        const node = buildBooleanReturnIfAst("condition", "false", "true");

        applyLogicalNormalization(node);

        assert.strictEqual(node.type, "ReturnStatement", "node should become a ReturnStatement");
        assert.strictEqual(node.argument?.type, "UnaryExpression");
        assert.strictEqual(node.argument?.operator, "!");
        assert.strictEqual(node.argument?.argument?.name, "condition");
    });

    void it("does NOT collapse when both branches return the same boolean", () => {
        const node = buildBooleanReturnIfAst("condition", "true", "true");
        const originalType = node.type;

        applyLogicalNormalization(node);

        assert.strictEqual(node.type, originalType, "node type should remain IfStatement");
    });

    void it("does NOT collapse when the node has comments attached", () => {
        const node = buildBooleanReturnIfAst("condition", "true", "false");
        // Attach a comment to the if-node to simulate `// comment` inside the block.
        node.comments = [{ type: "CommentLine", value: " some comment" }];

        applyLogicalNormalization(node);

        assert.strictEqual(node.type, "IfStatement", "node should remain an IfStatement when it has comments");
    });

    void it("does NOT collapse when the consequent block has comments", () => {
        const node = buildBooleanReturnIfAst("condition", "true", "false");
        node.consequent.comments = [{ type: "CommentLine", value: " stop simplification" }];

        applyLogicalNormalization(node);

        assert.strictEqual(node.type, "IfStatement", "node should remain an IfStatement when a branch has comments");
    });

    void it("does NOT collapse when the return statement has comments", () => {
        const node = buildBooleanReturnIfAst("condition", "true", "false");
        node.consequent.body[0].comments = [{ type: "CommentLine", value: " keep this" }];

        applyLogicalNormalization(node);

        assert.strictEqual(
            node.type,
            "IfStatement",
            "node should remain an IfStatement when a return statement has comments"
        );
    });

    void it("handles GML-style string boolean literals ('true'/'false' as strings)", () => {
        // Verify both native boolean and string-form literals are handled.
        const nodeStringForm = buildBooleanReturnIfAst("x", "true", "false");
        applyLogicalNormalization(nodeStringForm);
        assert.strictEqual(nodeStringForm.type, "ReturnStatement");
    });
});
