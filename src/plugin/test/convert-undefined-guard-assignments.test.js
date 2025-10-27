import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { convertUndefinedGuardAssignments } from "../src/ast-transforms/convert-undefined-guard-assignments.js";

function createIdentifier(name) {
    return { type: "Identifier", name };
}

function createLiteral(value) {
    return { type: "Literal", value };
}

describe("convertUndefinedGuardAssignments", () => {
    it("condenses undefined guard assignments into ternary expressions", () => {
        const guard = {
            type: "ParenthesizedExpression",
            expression: {
                type: "BinaryExpression",
                operator: "==",
                left: createIdentifier("pos"),
                right: createLiteral("undefined")
            }
        };

        const ifStatement = {
            type: "IfStatement",
            test: guard,
            consequent: {
                type: "BlockStatement",
                body: [
                    {
                        type: "AssignmentExpression",
                        operator: "=",
                        left: createIdentifier("pos"),
                        right: {
                            type: "UnaryExpression",
                            operator: "-",
                            prefix: true,
                            argument: createLiteral("1")
                        }
                    }
                ]
            },
            alternate: {
                type: "BlockStatement",
                body: [
                    {
                        type: "AssignmentExpression",
                        operator: "=",
                        left: createIdentifier("pos"),
                        right: createLiteral("0")
                    }
                ]
            }
        };

        const program = {
            type: "Program",
            body: [ifStatement]
        };

        convertUndefinedGuardAssignments(program);

        assert.equal(program.body.length, 1);
        const [statement] = program.body;
        assert.equal(statement.type, "ExpressionStatement");

        const assignment = statement.expression;
        assert.equal(assignment.type, "AssignmentExpression");
        assert.equal(assignment.operator, "=");
        assert.equal(assignment.left?.type, "Identifier");
        assert.equal(assignment.left?.name, "pos");

        const ternary = assignment.right;
        assert.equal(ternary.type, "TernaryExpression");
        assert.equal(ternary.consequent.type, "UnaryExpression");
        assert.equal(ternary.alternate.type, "Literal");

        const testExpression = ternary.test;
        assert.equal(testExpression.type, "CallExpression");
        assert.equal(testExpression.object?.type, "Identifier");
        assert.equal(testExpression.object?.name, "is_undefined");
        assert.equal(testExpression.arguments?.length, 1);
        assert.equal(testExpression.arguments?.[0]?.type, "Identifier");
        assert.equal(testExpression.arguments?.[0]?.name, "pos");
    });
});
