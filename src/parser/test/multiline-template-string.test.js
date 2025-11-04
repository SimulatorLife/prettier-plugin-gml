import assert from "node:assert/strict";
import { describe, it } from "node:test";
import GMLParser from "../gml-parser.js";

describe("Multi-line template string parsing", () => {
    it("parses a simple multi-line template string", () => {
        const source = `var str = $"Line one
Line two
Line three";`;

        const ast = GMLParser.parse(source);

        assert.ok(ast, "Parser should return an AST");
        assert.ok(
            ast.body && ast.body.length > 0,
            "AST should have statements"
        );
    });

    it("parses multi-line template string with interpolations", () => {
        const source = `var str = $"This is line one
{variable}
And line three with {another_var} here.";`;

        const ast = GMLParser.parse(source);

        assert.ok(ast, "Parser should return an AST");
        assert.ok(
            ast.body && ast.body.length > 0,
            "AST should have statements"
        );
    });

    it("parses multi-line template string with escape sequences", () => {
        const source = String.raw`var str = $"Line with \n escape
And another line with \t tab
Final line";`;

        const ast = GMLParser.parse(source);

        assert.ok(ast, "Parser should return an AST");
        assert.ok(
            ast.body && ast.body.length > 0,
            "AST should have statements"
        );
    });

    it("parses the testStrings fixture template string", () => {
        const source = `var _b = $"This is a string split across multiple 
{lines}
with {interpolation} in between.";`;

        const ast = GMLParser.parse(source);

        assert.ok(ast, "Parser should return an AST");
        assert.ok(
            ast.body && ast.body.length > 0,
            "AST should have statements"
        );
    });

    it("distinguishes template string from regular string", () => {
        const templateSource = `var a = $"Template {x} string";`;
        const regularSource = `var b = "Regular string";`;

        const templateAst = GMLParser.parse(templateSource);
        const regularAst = GMLParser.parse(regularSource);

        assert.ok(
            templateAst && templateAst.body.length > 0,
            "Template string should parse"
        );
        assert.ok(
            regularAst && regularAst.body.length > 0,
            "Regular string should parse"
        );
    });
});
