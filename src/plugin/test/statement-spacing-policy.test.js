import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    isMacroLikeStatement,
    shouldForceBlankLineBetweenReturnPaths,
    shouldForceTrailingBlankLineForNestedFunction,
    shouldSuppressEmptyLineBetween
} from "../src/printer/statement-spacing-policy.js";

describe("statement spacing policy", () => {
    it("detects macro-like statements", () => {
        const macroDeclaration = { type: "MacroDeclaration" };
        const defineMacro = {
            type: "DefineStatement",
            replacementDirective: "#macro"
        };
        const unrelated = { type: "ReturnStatement" };

        assert.equal(isMacroLikeStatement(macroDeclaration), true);
        assert.equal(isMacroLikeStatement(defineMacro), true);
        assert.equal(isMacroLikeStatement(unrelated), false);
        assert.equal(
            shouldSuppressEmptyLineBetween(macroDeclaration, null),
            false
        );
        assert.equal(
            shouldSuppressEmptyLineBetween(macroDeclaration, defineMacro),
            true
        );
        assert.equal(
            shouldSuppressEmptyLineBetween(macroDeclaration, unrelated),
            false
        );
    });

    it("requires nested functions to keep trailing padding", () => {
        const nestedFunction = { type: "FunctionDeclaration" };
        const block = { type: "BlockStatement" };
        const container = { type: "FunctionExpression" };
        const unrelatedContainer = { type: "StructDeclaration" };

        assert.equal(
            shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                container
            ),
            true
        );
        assert.equal(
            shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                unrelatedContainer
            ),
            false
        );
    });

    it("enforces padding between divergent return paths", () => {
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
            shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                fallbackReturn
            ),
            true
        );
        assert.equal(
            shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                matchingFallback
            ),
            false
        );
    });
});
