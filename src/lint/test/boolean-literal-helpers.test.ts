/**
 * Tests for the boolean-literal helpers in the `logical-expressions` module
 * after routing both `isBooleanLiteralValue` (condensation) and `getBooleanValue`
 * (traversal-normalization) through `Core.getBooleanLiteralValue`.
 *
 * The key behavioural additions verified here:
 *  1. String-form booleans (`"true"` / `"false"`) are recognised by
 *     `applyLogicalNormalization` – previously `getBooleanValue` only handled
 *     JS boolean primitives.
 *  2. `applyLogicalExpressionCondensation` continues to work correctly with
 *     both JS boolean primitives and string-form boolean literals.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MutableGameMakerAstNode } from "@gml-modules/core";

import { applyLogicalExpressionCondensation } from "../src/rules/gml/transforms/logical-expressions/condensation.js";
import { applyLogicalNormalization } from "../src/rules/gml/transforms/logical-expressions/traversal-normalization.js";

// ---------------------------------------------------------------------------
// Minimal AST factory helpers
// ---------------------------------------------------------------------------

function makeLiteral(value: string | boolean): MutableGameMakerAstNode {
    return { type: "Literal", value } as MutableGameMakerAstNode;
}

function makeIdentifier(name: string): MutableGameMakerAstNode {
    return { type: "Identifier", name } as MutableGameMakerAstNode;
}

function makeReturn(argument: MutableGameMakerAstNode): MutableGameMakerAstNode {
    return { type: "ReturnStatement", argument } as MutableGameMakerAstNode;
}

function makeBlock(statement: MutableGameMakerAstNode): MutableGameMakerAstNode {
    return { type: "BlockStatement", body: [statement] } as MutableGameMakerAstNode;
}

function makeIf(
    test: MutableGameMakerAstNode,
    consequent: MutableGameMakerAstNode,
    alternate?: MutableGameMakerAstNode
): MutableGameMakerAstNode {
    return {
        type: "IfStatement",
        test,
        consequent: makeBlock(consequent),
        ...(alternate === undefined ? {} : { alternate: makeBlock(alternate) })
    } as MutableGameMakerAstNode;
}

function makeProgram(body: MutableGameMakerAstNode[]): MutableGameMakerAstNode {
    return { type: "Program", body } as MutableGameMakerAstNode;
}

// ---------------------------------------------------------------------------
// applyLogicalNormalization – string-form boolean recognition
// ---------------------------------------------------------------------------

void describe('applyLogicalNormalization – string-form boolean literals ("true"/"false")', () => {
    void it('collapses "if (c) return true; else return false;" with string literals into "return c;"', () => {
        const condition = makeIdentifier("condition");
        const ast = makeProgram([makeIf(condition, makeReturn(makeLiteral("true")), makeReturn(makeLiteral("false")))]);

        applyLogicalNormalization(ast);

        // The if/else should be collapsed into a single ReturnStatement.
        const body = (ast as unknown as { body: MutableGameMakerAstNode[] }).body;
        assert.strictEqual(body.length, 1, "collapsed into one statement");
        assert.strictEqual(body[0].type, "ReturnStatement");
        // The return argument should be the condition (no negation).
        const returnArg = body[0] as unknown as { argument: { type: string; name: string } };
        assert.strictEqual(returnArg.argument.type, "Identifier");
        assert.strictEqual(returnArg.argument.name, "condition");
    });

    void it('collapses "if (c) return false; else return true;" with string literals into "return !c;"', () => {
        const condition = makeIdentifier("flag");
        const ast = makeProgram([makeIf(condition, makeReturn(makeLiteral("false")), makeReturn(makeLiteral("true")))]);

        applyLogicalNormalization(ast);

        const body = (ast as unknown as { body: MutableGameMakerAstNode[] }).body;
        assert.strictEqual(body.length, 1, "collapsed into one statement");
        assert.strictEqual(body[0].type, "ReturnStatement");
        // The return argument should be a negation of the condition.
        const returnArg = body[0] as unknown as {
            argument: { type: string; operator: string; argument: { name: string } };
        };
        assert.strictEqual(returnArg.argument.type, "UnaryExpression");
        assert.strictEqual(returnArg.argument.operator, "!");
        assert.strictEqual(returnArg.argument.argument.name, "flag");
    });

    void it("collapses JS boolean primitives the same way (regression guard)", () => {
        const condition = makeIdentifier("x");
        const ast = makeProgram([makeIf(condition, makeReturn(makeLiteral(true)), makeReturn(makeLiteral(false)))]);

        applyLogicalNormalization(ast);

        const body = (ast as unknown as { body: MutableGameMakerAstNode[] }).body;
        assert.strictEqual(body.length, 1, "collapsed into one statement");
        assert.strictEqual(body[0].type, "ReturnStatement");
        const returnArg = body[0] as unknown as { argument: { name: string } };
        assert.strictEqual(returnArg.argument.name, "x");
    });

    void it("simplifies true && A -> A with a string-form left operand", () => {
        // `true && condition` – the left side is a string literal "true".
        const condition = makeIdentifier("a");
        const logicalExpr = {
            type: "LogicalExpression",
            operator: "&&",
            left: makeLiteral("true"),
            right: condition
        } as MutableGameMakerAstNode;
        const ast = makeProgram([makeReturn(logicalExpr)]);

        applyLogicalNormalization(ast);

        const returnNode = (ast as unknown as { body: MutableGameMakerAstNode[] }).body[0];
        assert.strictEqual(returnNode.type, "ReturnStatement");
        // "true && a" should simplify to just "a"
        const returnArg = returnNode as unknown as { argument: { type: string; name: string } };
        assert.strictEqual(returnArg.argument.type, "Identifier");
        assert.strictEqual(returnArg.argument.name, "a");
    });
});

// ---------------------------------------------------------------------------
// applyLogicalExpressionCondensation – boolean literal value handling
// ---------------------------------------------------------------------------

void describe("applyLogicalExpressionCondensation – boolean literal value handling", () => {
    void it("condenses if/else returning true/false with JS boolean primitives (regression guard)", () => {
        const cond = makeIdentifier("cond");
        const ast = makeProgram([makeIf(cond, makeReturn(makeLiteral(true)), makeReturn(makeLiteral(false)))]);

        applyLogicalExpressionCondensation(ast);

        // Condensation should collapse the if/else to return cond directly.
        const body = (ast as unknown as { body: MutableGameMakerAstNode[] }).body;
        const returnLike = body[0];
        assert.ok(returnLike, "a statement should remain");
        assert.strictEqual(returnLike.type, "ReturnStatement");
    });

    void it("condenses if/else returning string-form true/false", () => {
        const cond = makeIdentifier("x");
        const ast = makeProgram([makeIf(cond, makeReturn(makeLiteral("true")), makeReturn(makeLiteral("false")))]);

        applyLogicalExpressionCondensation(ast);

        const body = (ast as unknown as { body: MutableGameMakerAstNode[] }).body;
        const returnLike = body[0];
        assert.ok(returnLike, "a statement should remain");
        assert.strictEqual(returnLike.type, "ReturnStatement");
    });
});
