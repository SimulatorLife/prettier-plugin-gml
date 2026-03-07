/**
 * Unit tests for the boolean condensation engine, specifically exercising the
 * two unified helpers introduced by the logic-deduplication pass:
 *
 *  • `absorbTermsForOperator`  (unification of the former `absorbOrTerms` /
 *                               `absorbAndTerms` mirror pair)
 *  • `factorAssociativeExpression` (unification of the former
 *                               `factorOrExpression` / `factorAndExpression`
 *                               mirror pair)
 *
 * Both helpers are internal to condensation.ts.  The tests exercise them
 * end-to-end through the public `applyLogicalExpressionCondensation` export,
 * using a minimal if-return AST pattern that drives the condensation pipeline:
 *
 *   if (<condition>) { return true; }
 *   return false;
 *
 * The condensation engine collapses this into `return <simplified>;`, where
 * <simplified> is the optimised form of <condition>.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyLogicalExpressionCondensation } from "../../src/rules/gml/transforms/logical-expressions/condensation.js";

// ---------------------------------------------------------------------------
// Minimal type covering the mock AST nodes used in this file
// ---------------------------------------------------------------------------

type MockNode =
    | { type: "Identifier"; name: string }
    | { type: "Literal"; value: boolean }
    | { type: "BinaryExpression"; operator: string; left: MockNode; right: MockNode }
    | { type: "ReturnStatement"; argument: MockNode }
    | { type: "BlockStatement"; body: MockNode[] }
    | { type: "IfStatement"; test: MockNode; consequent: MockNode; alternate: MockNode | null }
    | { type: "Program"; body: MockNode[] };

// ---------------------------------------------------------------------------
// Minimal AST-builder helpers
// ---------------------------------------------------------------------------

function ident(name: string): MockNode {
    return { type: "Identifier", name };
}

function lit(value: boolean): MockNode {
    return { type: "Literal", value };
}

function and(left: MockNode, right: MockNode): MockNode {
    return { type: "BinaryExpression", operator: "&&", left, right };
}

function or(left: MockNode, right: MockNode): MockNode {
    return { type: "BinaryExpression", operator: "||", left, right };
}

function block(...body: MockNode[]): MockNode {
    return { type: "BlockStatement", body };
}

function returnStmt(argument: MockNode): MockNode {
    return { type: "ReturnStatement", argument };
}

function ifStmt(test: MockNode, consequentBody: MockNode[], alternate: MockNode | null = null): MockNode {
    return {
        type: "IfStatement",
        test,
        consequent: block(...consequentBody),
        alternate
    };
}

/** Wrap statements in a Program so `applyLogicalExpressionCondensation` can traverse them. */
function program(...body: MockNode[]): MockNode {
    return { type: "Program", body };
}

/** No-op helpers: no node has comments. */
const noopHelpers = { hasComment: () => false };

// ---------------------------------------------------------------------------
// Output inspection helpers
// ---------------------------------------------------------------------------

/**
 * Render a minimal boolean AST node back to a compact infix string so that
 * assertions are readable without depending on the formatter.
 *
 * Accepts the union of node shapes that the condensation engine can emit when
 * converting a boolean expression back to GML AST.
 */
type PrintableNode =
    | { type: "Identifier"; name: string }
    | { type: "Literal"; value: string | boolean | number }
    | { type: "BinaryExpression" | "LogicalExpression"; operator: string; left: PrintableNode; right: PrintableNode }
    | { type: "UnaryExpression"; operator: string; argument: PrintableNode }
    | { type: "ParenthesizedExpression"; expression: PrintableNode }
    | { type: string };

function printNode(node: PrintableNode | null | undefined): string {
    if (!node) return "null";
    switch (node.type) {
        case "Identifier": {
            return (node as { type: "Identifier"; name: string }).name;
        }
        case "Literal": {
            return String((node as { type: "Literal"; value: string | boolean | number }).value);
        }
        case "BinaryExpression":
        case "LogicalExpression": {
            const bin = node as { operator: string; left: PrintableNode; right: PrintableNode };
            return `(${printNode(bin.left)} ${bin.operator} ${printNode(bin.right)})`;
        }
        case "UnaryExpression": {
            const un = node as { operator: string; argument: PrintableNode };
            return `${un.operator}${printNode(un.argument)}`;
        }
        case "ParenthesizedExpression": {
            return printNode((node as { expression: PrintableNode }).expression);
        }
        default: {
            return `[${node.type}]`;
        }
    }
}

/**
 * Run `applyLogicalExpressionCondensation` on an `if (cond) { return true; }
 * return false;` pattern and return the printed form of the condensed return
 * argument.  Returns `null` when condensation did not fire (body still
 * contains an IfStatement).
 */
function condenseIfReturnPattern(condition: MockNode): string | null {
    const ast = program(ifStmt(condition, [returnStmt(lit(true))]), returnStmt(lit(false)));
    applyLogicalExpressionCondensation(ast as Parameters<typeof applyLogicalExpressionCondensation>[0], noopHelpers);
    const body = (ast as { body: Array<{ type: string; argument: PrintableNode }> }).body;
    // Condensation folds the two statements into one `return <expr>;`.
    if (body.length === 1 && body[0].type === "ReturnStatement") {
        return printNode(body[0].argument);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Tests – absorbTermsForOperator (OR polarity)
// ---------------------------------------------------------------------------

void describe("absorbTermsForOperator – OR absorption  (a || (a && b)) → a", () => {
    void it("drops the AND sub-term that is subsumed by the standalone OR operand", () => {
        const a = ident("a");
        const b = ident("b");
        // a || (a && b)  →  a
        const condensed = condenseIfReturnPattern(or(a, and(a, b)));
        assert.strictEqual(condensed, "a");
    });
});

// ---------------------------------------------------------------------------
// Tests – absorbTermsForOperator (AND polarity)
// ---------------------------------------------------------------------------

void describe("absorbTermsForOperator – AND absorption  (a && (a || b)) → a", () => {
    void it("drops the OR sub-term that is subsumed by the standalone AND operand", () => {
        const a = ident("a");
        const b = ident("b");
        // a && (a || b)  →  a
        const condensed = condenseIfReturnPattern(and(a, or(a, b)));
        assert.strictEqual(condensed, "a");
    });
});

// ---------------------------------------------------------------------------
// Tests – factorAssociativeExpression (OR outer / AND inner)
// ---------------------------------------------------------------------------

void describe("factorAssociativeExpression – OR factoring  (a && b) || (a && c) → a && (b || c)", () => {
    void it("factors the common AND sub-term out of the OR expression", () => {
        const a = ident("a");
        const b = ident("b");
        const c = ident("c");
        // (a && b) || (a && c)  →  a && (b || c)
        const condensed = condenseIfReturnPattern(or(and(a, b), and(a, c)));
        assert.ok(condensed !== null, "condensation should fire");
        // The result contains a && operator at the top level and both b and c.
        assert.ok(condensed.includes("&&"), `expected && in result, got: ${condensed}`);
        assert.ok(condensed.includes("b"), `expected b in result, got: ${condensed}`);
        assert.ok(condensed.includes("c"), `expected c in result, got: ${condensed}`);
        // Ensure the common factor appears only once (factored out).
        const aCount = (condensed.match(/\ba\b/g) ?? []).length;
        assert.strictEqual(aCount, 1, `expected 'a' to appear exactly once (factored), got: ${condensed}`);
    });
});

// ---------------------------------------------------------------------------
// Tests – factorAssociativeExpression (AND outer / OR inner)
// ---------------------------------------------------------------------------

void describe("factorAssociativeExpression – AND factoring  (a || b) && (a || c) → a || (b && c)", () => {
    void it("factors the common OR sub-term out of the AND expression", () => {
        const a = ident("a");
        const b = ident("b");
        const c = ident("c");
        // (a || b) && (a || c)  →  a || (b && c)
        const condensed = condenseIfReturnPattern(and(or(a, b), or(a, c)));
        assert.ok(condensed !== null, "condensation should fire");
        assert.ok(condensed.includes("||"), `expected || in result, got: ${condensed}`);
        assert.ok(condensed.includes("b"), `expected b in result, got: ${condensed}`);
        assert.ok(condensed.includes("c"), `expected c in result, got: ${condensed}`);
        // Ensure the common factor appears only once (factored out).
        const aCount = (condensed.match(/\ba\b/g) ?? []).length;
        assert.strictEqual(aCount, 1, `expected 'a' to appear exactly once (factored), got: ${condensed}`);
    });
});
