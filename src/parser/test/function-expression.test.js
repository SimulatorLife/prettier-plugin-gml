import assert from "node:assert/strict";
import { describe, it } from "node:test";

import GMLParser from "../gml-parser.js";

describe("function expressions", () => {
    it("parses inline functions inside conditional expressions", () => {
        const source = [
            "var handler = (flag ? function () {",
            "    return 1;",
            "} : function named() {",
            "    return 2;",
            "});"
        ].join("\n");

        const ast = GMLParser.parse(source);

        assert.ok(
            ast,
            "Expected parser to return an AST for function expression input."
        );
        const [statement] = ast.body;
        assert.ok(
            statement && statement.type === "VariableDeclaration",
            "Expected a variable declaration for the handler assignment."
        );

        const [declarator] = statement.declarations;
        assert.ok(
            declarator && declarator.init,
            "Variable declarator should include an initializer."
        );

        const initializer =
            declarator.init?.type === "ParenthesizedExpression"
                ? declarator.init.expression
                : declarator.init;
        assert.ok(
            initializer && initializer.type === "TernaryExpression",
            "Initializer should parse as a ternary expression."
        );

        const { consequent, alternate } = initializer;
        assert.ok(
            consequent && consequent.type === "FunctionDeclaration",
            "Expected ternary consequent to be parsed as a function declaration."
        );
        assert.strictEqual(
            consequent.id,
            null,
            "Anonymous function expression should not expose an identifier."
        );

        assert.ok(
            alternate && alternate.type === "FunctionDeclaration",
            "Expected ternary alternate to be parsed as a function declaration."
        );
        assert.strictEqual(
            alternate.id,
            "named",
            "Named function expression should retain its identifier."
        );
    });
});
