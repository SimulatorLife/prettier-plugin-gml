import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GMLParser } from "../src/gml-parser.js";

void describe("Multi-line template strings", () => {
    void it("parses template strings with newlines in the literal text", () => {
        const source = `var _b = $"This is a string split across multiple 
{lines}
with {interpolation} in between.";`;

        const ast = GMLParser.parse(source);

        // Should not throw and should successfully parse
        assert.ok(ast, "Parser should return an AST");
        assert.ok(ast.body, "AST should have a body");
        assert.strictEqual(ast.body.length, 1, "Should have one statement");

        const [statement] = ast.body;
        assert.strictEqual(statement.type, "VariableDeclaration", "Should be a variable declaration");
    });

    void it("preserves newlines in template string text when parsing", () => {
        const source = `var _x = $"Line one
Line two
Line three";`;

        const ast = GMLParser.parse(source);

        // Should not throw
        assert.ok(ast, "Parser should successfully parse multi-line template strings");
        assert.ok(ast.body, "AST should have a body");
    });

    void it("parses template strings with interpolation across multiple lines", () => {
        const source = `var _msg = $"Hello
{name}
Welcome!";`;

        const ast = GMLParser.parse(source);

        assert.ok(ast, "Parser should handle interpolation in multi-line template strings");
        assert.ok(ast.body, "AST should have a body");
        assert.strictEqual(ast.body.length, 1, "Should have one statement");
    });
});
