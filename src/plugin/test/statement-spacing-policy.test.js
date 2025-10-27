import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StatementSpacingPolicy } from "../src/printer/statement-spacing-policy.js";

describe("StatementSpacingPolicy", () => {
    it("detects macro-like statements", () => {
        const policy = new StatementSpacingPolicy();
        const macroDeclaration = { type: "MacroDeclaration" };
        const defineMacro = {
            type: "DefineStatement",
            replacementDirective: "#macro"
        };
        const unrelated = { type: "ReturnStatement" };

        assert.equal(policy.isMacroLikeStatement(macroDeclaration), true);
        assert.equal(policy.isMacroLikeStatement(defineMacro), true);
        assert.equal(policy.isMacroLikeStatement(unrelated), false);
        assert.equal(
            policy.shouldSuppressEmptyLineBetween(macroDeclaration, null),
            false
        );
        assert.equal(
            policy.shouldSuppressEmptyLineBetween(
                macroDeclaration,
                defineMacro
            ),
            true
        );
        assert.equal(
            policy.shouldSuppressEmptyLineBetween(macroDeclaration, unrelated),
            false
        );
    });

    it("requires nested functions to keep trailing padding", () => {
        const policy = new StatementSpacingPolicy();
        const nestedFunction = { type: "FunctionDeclaration" };
        const block = { type: "BlockStatement" };
        const container = { type: "FunctionExpression" };
        const unrelatedContainer = { type: "StructDeclaration" };

        assert.equal(
            policy.shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                container
            ),
            true
        );
        assert.equal(
            policy.shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                unrelatedContainer
            ),
            false
        );
    });

    it("enforces padding between divergent return paths", () => {
        const policy = new StatementSpacingPolicy();
        const guardedReturn = {
            type: "IfStatement",
            alternate: null,
            consequent: {
                type: "BlockStatement",
                body: [
                    {
                        type: "ReturnStatement",
                        argument: { type: "Literal", value: "true" }
                    }
                ]
            }
        };
        const fallbackReturn = {
            type: "ReturnStatement",
            argument: { type: "Literal", value: "false" }
        };
        const matchingFallback = {
            type: "ReturnStatement",
            argument: { type: "Literal", value: "true" }
        };

        assert.equal(
            policy.shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                fallbackReturn
            ),
            true
        );
        assert.equal(
            policy.shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                matchingFallback
            ),
            false
        );
    });
});
