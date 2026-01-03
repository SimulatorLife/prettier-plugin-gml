import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DefineReplacementDirective,
    getNormalizedDefineReplacementDirective,
    isFunctionLikeDeclaration,
    isMacroLikeStatement
} from "../../src/ast/node-classification.js";

void describe("AST node classification helpers", () => {
    void it("normalizes define directives case-insensitively", () => {
        const regionNode = {
            type: "DefineStatement",
            replacementDirective: "#REGION"
        };
        const macroNode = {
            type: "DefineStatement",
            replacementDirective: "  #MACRO  "
        };

        assert.equal(getNormalizedDefineReplacementDirective(regionNode), DefineReplacementDirective.REGION);
        assert.equal(getNormalizedDefineReplacementDirective(macroNode), DefineReplacementDirective.MACRO);
    });

    void it("returns null when define statements lack directives", () => {
        assert.equal(getNormalizedDefineReplacementDirective(null), null);
        assert.equal(
            getNormalizedDefineReplacementDirective({
                type: "DefineStatement"
            }),
            null
        );
        assert.equal(
            getNormalizedDefineReplacementDirective({
                type: "DefineStatement",
                replacementDirective: "   "
            }),
            null
        );
    });

    void it("throws when encountering an unsupported directive", () => {
        assert.throws(
            () =>
                getNormalizedDefineReplacementDirective({
                    type: "DefineStatement",
                    replacementDirective: "#unknown"
                }),
            (error) => error instanceof RangeError && /#unknown/.test(error.message)
        );
    });

    void it("classifies macro-like statements", () => {
        const macroDeclaration = { type: "MacroDeclaration" };
        const defineMacro = {
            type: "DefineStatement",
            replacementDirective: "#macro"
        };
        const unrelated = { type: "ReturnStatement" };

        assert.equal(isMacroLikeStatement(macroDeclaration), true);
        assert.equal(isMacroLikeStatement(defineMacro), true);
        assert.equal(isMacroLikeStatement(unrelated), false);
    });

    void it("recognizes function-like declarations", () => {
        assert.equal(isFunctionLikeDeclaration({ type: "FunctionDeclaration" }), true);
        assert.equal(isFunctionLikeDeclaration({ type: "ConstructorDeclaration" }), true);
        assert.equal(isFunctionLikeDeclaration({ type: "FunctionExpression" }), true);
        assert.equal(isFunctionLikeDeclaration({ type: "StructDeclaration" }), false);
    });
});
