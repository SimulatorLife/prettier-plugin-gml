/**
 * Tests for `applyLogicalNormalization` from the logical-expressions traversal
 * normalizer. In particular these tests exercise the unified
 * `nodesRecursiveEqual` predicate that replaced the former `nodesAreEqual`
 * helper. Both the original Identifier/Literal paths (previously covered by
 * the weaker `nodesAreEqual`) and the newly supported MemberDotExpression
 * path (only handled correctly by `nodesRecursiveEqual`) are exercised here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MutableGameMakerAstNode } from "@gml-modules/core";

import { applyLogicalNormalization } from "../../src/rules/gml/transforms/logical-expressions/traversal-normalization.js";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function identifier(name: string): MutableGameMakerAstNode {
    return { type: "Identifier", name };
}

function memberDot(object: MutableGameMakerAstNode, propertyName: string): MutableGameMakerAstNode {
    return {
        type: "MemberDotExpression",
        object,
        property: identifier(propertyName)
    } as MutableGameMakerAstNode;
}

function logical(
    operator: string,
    left: MutableGameMakerAstNode,
    right: MutableGameMakerAstNode
): MutableGameMakerAstNode {
    return { type: "LogicalExpression", operator, left, right } as MutableGameMakerAstNode;
}

function program(...body: MutableGameMakerAstNode[]): MutableGameMakerAstNode {
    return { type: "Program", body } as MutableGameMakerAstNode;
}

function exprStmt(expression: MutableGameMakerAstNode): MutableGameMakerAstNode {
    return { type: "ExpressionStatement", expression } as MutableGameMakerAstNode;
}

/** Extract the expression inside the first ExpressionStatement of a Program. */
function firstBodyExpression(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
    const body = ast.body as MutableGameMakerAstNode[] | undefined;
    const stmt = body?.[0];
    assert.ok(stmt, "program body must have at least one statement");
    return stmt.expression as MutableGameMakerAstNode;
}

// ---------------------------------------------------------------------------
// Absorption: A || (A && B) -> A
// ---------------------------------------------------------------------------

void describe("applyLogicalNormalization – absorption law (Identifier operands)", () => {
    void it("simplifies `a || (a && b)` to `a` (Identifier)", () => {
        // Build the AST for `a || (a && b)` inside a Program body so the
        // traversal reaches all nodes.
        const innerAnd = logical("&&", identifier("a"), identifier("b"));
        const outerOr = logical("||", identifier("a"), innerAnd);
        const ast = program(exprStmt(outerOr));

        applyLogicalNormalization(ast);

        // After simplification the ExpressionStatement's expression should be
        // just an Identifier "a" (the absorbed operand).
        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "Identifier", "expected Identifier after absorption");
        assert.strictEqual(result.name, "a");
    });

    void it("simplifies `a && (a || b)` to `a` (Identifier)", () => {
        const innerOr = logical("||", identifier("a"), identifier("b"));
        const outerAnd = logical("&&", identifier("a"), innerOr);
        const ast = program(exprStmt(outerAnd));

        applyLogicalNormalization(ast);

        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "Identifier");
        assert.strictEqual(result.name, "a");
    });
});

// ---------------------------------------------------------------------------
// Absorption with MemberDotExpression operands
// These tests specifically exercise the `nodesRecursiveEqual` path that was
// NOT reachable through the former `nodesAreEqual` helper (which returned
// false for any non-Identifier/non-Literal node kind).
// ---------------------------------------------------------------------------

void describe("applyLogicalNormalization – absorption law (MemberDotExpression operands)", () => {
    void it("simplifies `obj.x || (obj.x && b)` to `obj.x`", () => {
        const objX = memberDot(identifier("obj"), "x");
        const objXCopy = memberDot(identifier("obj"), "x");
        const innerAnd = logical("&&", objXCopy, identifier("b"));
        const outerOr = logical("||", objX, innerAnd);
        const ast = program(exprStmt(outerOr));

        applyLogicalNormalization(ast);

        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "MemberDotExpression", "expected MemberDotExpression after absorption");
        const object = result.object as MutableGameMakerAstNode;
        const property = result.property as MutableGameMakerAstNode;
        assert.strictEqual(object.name, "obj");
        assert.strictEqual(property.name, "x");
    });

    void it("simplifies `obj.x && (obj.x || b)` to `obj.x`", () => {
        const objX = memberDot(identifier("obj"), "x");
        const objXCopy = memberDot(identifier("obj"), "x");
        const innerOr = logical("||", objXCopy, identifier("b"));
        const outerAnd = logical("&&", objX, innerOr);
        const ast = program(exprStmt(outerAnd));

        applyLogicalNormalization(ast);

        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "MemberDotExpression");
        const object = result.object as MutableGameMakerAstNode;
        const property = result.property as MutableGameMakerAstNode;
        assert.strictEqual(object.name, "obj");
        assert.strictEqual(property.name, "x");
    });
});

// ---------------------------------------------------------------------------
// Non-matching cases (different identifiers) must NOT be simplified
// ---------------------------------------------------------------------------

void describe("applyLogicalNormalization – no simplification for differing operands", () => {
    void it("does NOT simplify `a || (b && c)` when LHS differs from inner-AND LHS", () => {
        const innerAnd = logical("&&", identifier("b"), identifier("c"));
        const outerOr = logical("||", identifier("a"), innerAnd);
        const ast = program(exprStmt(outerOr));

        applyLogicalNormalization(ast);

        // The expression should remain a LogicalExpression (not absorbed).
        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "LogicalExpression");
        assert.strictEqual(result.operator, "||");
    });

    void it("does NOT simplify `obj.x || (obj.y && b)` when member properties differ", () => {
        const objX = memberDot(identifier("obj"), "x");
        const objY = memberDot(identifier("obj"), "y");
        const innerAnd = logical("&&", objY, identifier("b"));
        const outerOr = logical("||", objX, innerAnd);
        const ast = program(exprStmt(outerOr));

        applyLogicalNormalization(ast);

        const result = firstBodyExpression(ast);
        assert.strictEqual(result.type, "LogicalExpression");
        assert.strictEqual(result.operator, "||");
    });
});
