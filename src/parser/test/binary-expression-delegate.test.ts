import assert from "node:assert/strict";
import { describe, it } from "node:test";
import BinaryExpressionDelegate from "../src/ast/binary-expression-delegate.js";

const mockVisit = () => ({ type: "Identifier", name: "x" });
const mockAstNode = (_ctx: any, value: any) => value;

void describe("BinaryExpressionDelegate", () => {
    void describe("handle", () => {
        void it("should guard against malformed context with missing children", () => {
            const delegate = new BinaryExpressionDelegate({
                operators: {
                    "+": { prec: 10, assoc: "left" },
                    "*": { prec: 20, assoc: "left" }
                }
            });

            // Context with children but missing the operator at index 1
            const malformedCtx = {
                expression: () => [{ getText: () => "x" }, { getText: () => "y" }],
                children: [
                    { getText: () => "x" }
                    // Missing children[1] which should contain the operator
                ]
            };

            // This should not throw TypeError
            assert.doesNotThrow(() => {
                delegate.handle(malformedCtx, {
                    visit: mockVisit,
                    astNode: mockAstNode
                });
            });
        });

        void it("should guard against context with undefined children array", () => {
            const delegate = new BinaryExpressionDelegate({
                operators: {
                    "+": { prec: 10, assoc: "left" }
                }
            });

            // Context with expression but no children array
            const malformedCtx = {
                expression: () => [{ getText: () => "x" }, { getText: () => "y" }],
                children: undefined
            };

            // This should not throw TypeError
            assert.doesNotThrow(() => {
                delegate.handle(malformedCtx, {
                    visit: mockVisit,
                    astNode: mockAstNode
                });
            });
        });

        void it("should guard against context with null children array", () => {
            const delegate = new BinaryExpressionDelegate({
                operators: {
                    "+": { prec: 10, assoc: "left" }
                }
            });

            // Context with expression but null children array
            const malformedCtx = {
                expression: () => [{ getText: () => "x" }, { getText: () => "y" }],
                children: null
            };

            // This should not throw TypeError
            assert.doesNotThrow(() => {
                delegate.handle(malformedCtx, {
                    visit: mockVisit,
                    astNode: mockAstNode
                });
            });
        });

        void it("should return valid result for well-formed binary expression", () => {
            const delegate = new BinaryExpressionDelegate({
                operators: {
                    "+": { prec: 10, assoc: "left" }
                }
            });

            const wellFormedCtx = {
                expression: () => [
                    { name: "left", getText: () => "a" },
                    { name: "right", getText: () => "b" }
                ],
                children: [{ getText: () => "a" }, { getText: () => "+" }, { getText: () => "b" }]
            };

            const result = delegate.handle(wellFormedCtx, {
                visit: (node: any) => {
                    if (node.name === "left") {
                        return { type: "Identifier", name: "a" };
                    }
                    return { type: "Identifier", name: "b" };
                },
                astNode: mockAstNode
            });

            assert.strictEqual(result.type, "BinaryExpression");
            assert.strictEqual(result.operator, "+");
            assert.strictEqual(result.left.name, "a");
            assert.strictEqual(result.right.name, "b");
        });
    });
});
