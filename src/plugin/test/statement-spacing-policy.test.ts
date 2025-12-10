import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Core } from "@gml-modules/core";

import * as Printer from "../src/printer/index.js";

void describe("statement spacing policy", () => {
    afterEach(() => {
        Printer.StatementSpacingPolicy.resetSurroundingNewlineNodeTypes();
    });

    void it("detects macro-like statements", () => {
        const macroDeclaration = { type: "MacroDeclaration" };
        const defineMacro = {
            type: "DefineStatement",
            replacementDirective: "#macro"
        };
        const unrelated = { type: "ReturnStatement" };

        assert.equal(Core.isMacroLikeStatement(macroDeclaration), true);
        assert.equal(Core.isMacroLikeStatement(defineMacro), true);
        assert.equal(Core.isMacroLikeStatement(unrelated), false);
        assert.equal(
            Printer.StatementSpacingPolicy.shouldSuppressEmptyLineBetween(
                macroDeclaration,
                null
            ),
            false
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldSuppressEmptyLineBetween(
                macroDeclaration,
                defineMacro
            ),
            true
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldSuppressEmptyLineBetween(
                macroDeclaration,
                unrelated
            ),
            false
        );
    });

    void it("requires nested functions to keep trailing padding", () => {
        const nestedFunction = { type: "FunctionDeclaration" };
        const block = { type: "BlockStatement" };
        const container = { type: "FunctionExpression" };
        const unrelatedContainer = { type: "StructDeclaration" };

        assert.equal(
            Printer.StatementSpacingPolicy.shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                container
            ),
            true
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldForceTrailingBlankLineForNestedFunction(
                nestedFunction,
                block,
                unrelatedContainer
            ),
            false
        );
    });

    void it("enforces padding between divergent return paths", () => {
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
            Printer.StatementSpacingPolicy.shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                fallbackReturn
            ),
            true
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldForceBlankLineBetweenReturnPaths(
                guardedReturn,
                matchingFallback
            ),
            false
        );
    });

    void it("keeps default newline padding behavior", () => {
        assert.equal(
            Printer.StatementSpacingPolicy.shouldAddNewlinesAroundStatement({
                type: "FunctionDeclaration"
            }),
            true
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldAddNewlinesAroundStatement({
                type: "RegionStatement"
            }),
            true
        );
        assert.equal(
            Printer.StatementSpacingPolicy.shouldAddNewlinesAroundStatement({
                type: "ReturnStatement"
            }),
            false
        );
    });

    void it("allows internal consumers to register extra padded statement types", () => {
        const experimentalNode = { type: "ExperimentalStatement" };

        assert.equal(
            Printer.StatementSpacingPolicy.shouldAddNewlinesAroundStatement(
                experimentalNode
            ),
            false
        );

        Printer.StatementSpacingPolicy.registerSurroundingNewlineNodeTypes(
            "ExperimentalStatement"
        );

        assert.equal(
            Printer.StatementSpacingPolicy.shouldAddNewlinesAroundStatement(
                experimentalNode
            ),
            true
        );
    });
});
