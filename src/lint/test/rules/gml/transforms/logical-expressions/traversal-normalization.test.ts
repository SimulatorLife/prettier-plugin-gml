/**
 * Tests for applyLogicalNormalization, focusing on the unified
 * `nodesRecursiveEqual` comparison helper that replaced the narrower
 * `nodesAreEqual`. The key behavioral improvement: absorption and
 * distributive laws now also fire when operands are member-access
 * expressions (MemberDotExpression, MemberIndexExpression), not only
 * plain Identifiers and Literals.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyLogicalNormalization } from "../../../../../src/rules/gml/transforms/logical-expressions/traversal-normalization.js";

/** Build `obj.prop` as a MemberDotExpression AST node. */
function memberDot(objectName: string, propertyName: string): unknown {
    return {
        type: "MemberDotExpression",
        object: { type: "Identifier", name: objectName },
        property: { type: "Identifier", name: propertyName }
    };
}

/** Build `left && right` as a LogicalExpression AST node. */
function and(left: unknown, right: unknown): unknown {
    return { type: "LogicalExpression", operator: "&&", left, right };
}

/** Build `left || right` as a LogicalExpression AST node. */
function or(left: unknown, right: unknown): unknown {
    return { type: "LogicalExpression", operator: "||", left, right };
}

/** Build an Identifier AST node. */
function ident(name: string): unknown {
    return { type: "Identifier", name };
}

/** Wrap an expression in a Program > body > ExpressionStatement for normalization. */
function wrapInProgram(expression: unknown): any {
    return {
        type: "Program",
        body: [{ type: "ExpressionStatement", expression }]
    };
}

/** Extract the top-level expression from a wrapped program node. */
function unwrapExpression(ast: any): any {
    return ast.body[0].expression;
}

void describe("applyLogicalNormalization – nodesRecursiveEqual unification", () => {
    void it("applies absorption A || (A && B) for plain Identifier operands", () => {
        // A || (A && B) -> A   (pre-existing behaviour, must remain correct)
        const A = ident("x");
        const B = ident("y");
        const ast = wrapInProgram(or(A, and(A, B)));

        applyLogicalNormalization(ast);

        const result = unwrapExpression(ast);
        // After absorption the expression should collapse to the identifier A.
        assert.strictEqual(result.type, "Identifier");
        assert.strictEqual(result.name, "x");
    });

    void it("applies absorption A || (A && B) for MemberDotExpression operands", () => {
        // Previously nodesAreEqual returned false for MemberDotExpression, so
        // the absorption law did NOT fire. nodesRecursiveEqual handles member
        // access recursively, so obj.prop || (obj.prop && B) -> obj.prop.
        const A1 = memberDot("obj", "prop");
        const A2 = memberDot("obj", "prop");
        const B = ident("b");
        const ast = wrapInProgram(or(A1, and(A2, B)));

        applyLogicalNormalization(ast);

        const result = unwrapExpression(ast);
        assert.strictEqual(
            result.type,
            "MemberDotExpression",
            "absorption should collapse obj.prop || (obj.prop && b) to obj.prop"
        );
        assert.strictEqual((result.object).name, "obj");
        assert.strictEqual((result.property).name, "prop");
    });

    void it("applies absorption A && (A || B) for MemberDotExpression operands", () => {
        // obj.prop && (obj.prop || B) -> obj.prop
        const A1 = memberDot("obj", "x");
        const A2 = memberDot("obj", "x");
        const B = ident("b");
        const ast = wrapInProgram(and(A1, or(A2, B)));

        applyLogicalNormalization(ast);

        const result = unwrapExpression(ast);
        assert.strictEqual(
            result.type,
            "MemberDotExpression",
            "absorption should collapse obj.x && (obj.x || b) to obj.x"
        );
        assert.strictEqual((result.object).name, "obj");
        assert.strictEqual((result.property).name, "x");
    });
});
