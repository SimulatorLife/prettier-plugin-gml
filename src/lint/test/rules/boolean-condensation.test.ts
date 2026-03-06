/**
 * Unit tests for the boolean condensation helpers introduced by unifying the
 * former `factorOrExpression`/`factorAndExpression` pair into a single
 * `factorAssociativeExpression`, and `absorbOrTerms`/`absorbAndTerms` into a
 * single `absorbTermsForOperator`.
 *
 * These helpers are private to `condensation.ts` and are exercised here
 * through the public `applyLogicalExpressionCondensation` API.  Every test
 * follows the pattern:
 *
 *   function fn(…) {
 *     if (<condition>) return true;
 *     return false;
 *   }
 *
 * The condensation pass collapses such patterns into a single
 * `return <simplified-condition>`, so we verify the simplified form.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyLogicalExpressionCondensation } from "../../src/rules/gml/transforms/logical-expressions/condensation.js";

// ---------------------------------------------------------------------------
// Minimal AST builders
// ---------------------------------------------------------------------------

function id(name: string): any {
    return { type: "Identifier", name };
}

function and(left: any, right: any): any {
    return { type: "BinaryExpression", operator: "&&", left, right };
}

function or(left: any, right: any): any {
    return { type: "BinaryExpression", operator: "||", left, right };
}

function returnStmt(argument: any): any {
    return { type: "ReturnStatement", argument };
}

function lit(value: "true" | "false"): any {
    return { type: "Literal", value };
}

/**
 * Wraps `condition` in a minimal `if (condition) return true; return false;`
 * program, runs `applyLogicalExpressionCondensation`, and returns the
 * resulting statement list so that assertions can inspect the simplified form.
 */
function condenseCondition(condition: any): any[] {
    const body: any[] = [
        {
            type: "IfStatement",
            test: condition,
            consequent: { type: "BlockStatement", body: [returnStmt(lit("true"))] },
            alternate: null
        },
        returnStmt(lit("false"))
    ];
    const ast: any = { type: "Program", body };
    applyLogicalExpressionCondensation(ast, undefined);
    return body;
}

// ---------------------------------------------------------------------------
// Helpers that unwrap optional parenthesization so assertions stay stable
// regardless of whether `wrapBinaryOperand` added synthetic parens.
// ---------------------------------------------------------------------------

function unwrapParens(node: any): any {
    return node?.type === "ParenthesizedExpression" ? node.expression : node;
}

// ---------------------------------------------------------------------------
// factorAssociativeExpression – OR-outer case
//
// Boolean law: (A ∧ B) ∨ (A ∧ C)  →  A ∧ (B ∨ C)
// ---------------------------------------------------------------------------

void describe("factorAssociativeExpression – OR-outer: (a && b) || (a && c)  →  a && (b || c)", () => {
    void it("condenses if ((a && b) || (a && c)) return true; to return a && (b || c);", () => {
        // Build: (a && b) || (a && c)
        const condition = or(and(id("a"), id("b")), and(id("a"), id("c")));
        const result = condenseCondition(condition);

        // Two statements collapsed to one return
        assert.strictEqual(result.length, 1);
        const ret = result[0];
        assert.strictEqual(ret.type, "ReturnStatement");

        const arg = ret.argument;
        assert.ok(arg, "return argument should be present");
        assert.strictEqual(arg.type, "BinaryExpression");
        assert.strictEqual(arg.operator, "&&");

        // Left side should be identifier `a`
        const left = unwrapParens(arg.left);
        assert.strictEqual(left.type, "Identifier");
        assert.strictEqual(left.name, "a");

        // Right side should be `b || c` (possibly parenthesized)
        const right = unwrapParens(arg.right);
        assert.strictEqual(right.type, "BinaryExpression");
        assert.strictEqual(right.operator, "||");

        const innerLeft = unwrapParens(right.left);
        const innerRight = unwrapParens(right.right);
        const names = new Set([innerLeft.name, innerRight.name]);
        assert.ok(names.has("b"), "b should appear in the OR sub-expression");
        assert.ok(names.has("c"), "c should appear in the OR sub-expression");
    });
});

// ---------------------------------------------------------------------------
// factorAssociativeExpression – AND-outer case
//
// Boolean law: (A ∨ B) ∧ (A ∨ C)  →  A ∨ (B ∧ C)
// ---------------------------------------------------------------------------

void describe("factorAssociativeExpression – AND-outer: (a || b) && (a || c)  →  a || (b && c)", () => {
    void it("condenses if ((a || b) && (a || c)) return true; to return a || (b && c);", () => {
        // Build: (a || b) && (a || c)
        const condition = and(or(id("a"), id("b")), or(id("a"), id("c")));
        const result = condenseCondition(condition);

        assert.strictEqual(result.length, 1);
        const ret = result[0];
        assert.strictEqual(ret.type, "ReturnStatement");

        const arg = ret.argument;
        assert.ok(arg, "return argument should be present");
        assert.strictEqual(arg.type, "BinaryExpression");
        assert.strictEqual(arg.operator, "||");

        // Left side should be identifier `a`
        const left = unwrapParens(arg.left);
        assert.strictEqual(left.type, "Identifier");
        assert.strictEqual(left.name, "a");

        // Right side should be `b && c` (possibly parenthesized)
        const right = unwrapParens(arg.right);
        assert.strictEqual(right.type, "BinaryExpression");
        assert.strictEqual(right.operator, "&&");

        const innerLeft = unwrapParens(right.left);
        const innerRight = unwrapParens(right.right);
        const names = new Set([innerLeft.name, innerRight.name]);
        assert.ok(names.has("b"), "b should appear in the AND sub-expression");
        assert.ok(names.has("c"), "c should appear in the AND sub-expression");
    });
});

// ---------------------------------------------------------------------------
// absorbTermsForOperator – OR-outer case
//
// Absorption law: A ∨ (A ∧ B)  →  A
// ---------------------------------------------------------------------------

void describe("absorbTermsForOperator – OR-outer: a || (a && b)  →  a", () => {
    void it("condenses if (a || (a && b)) return true; to return a;", () => {
        // Build: a || (a && b)
        const condition = or(id("a"), and(id("a"), id("b")));
        const result = condenseCondition(condition);

        assert.strictEqual(result.length, 1);
        const ret = result[0];
        assert.strictEqual(ret.type, "ReturnStatement");

        // The absorbed expression should be just `a`
        const arg = unwrapParens(ret.argument);
        assert.strictEqual(arg.type, "Identifier");
        assert.strictEqual(arg.name, "a");
    });
});

// ---------------------------------------------------------------------------
// absorbTermsForOperator – AND-outer case
//
// Absorption law: A ∧ (A ∨ B)  →  A
// ---------------------------------------------------------------------------

void describe("absorbTermsForOperator – AND-outer: a && (a || b)  →  a", () => {
    void it("condenses if (a && (a || b)) return true; to return a;", () => {
        // Build: a && (a || b)
        const condition = and(id("a"), or(id("a"), id("b")));
        const result = condenseCondition(condition);

        assert.strictEqual(result.length, 1);
        const ret = result[0];
        assert.strictEqual(ret.type, "ReturnStatement");

        // The absorbed expression should be just `a`
        const arg = unwrapParens(ret.argument);
        assert.strictEqual(arg.type, "Identifier");
        assert.strictEqual(arg.name, "a");
    });
});
