/**
 * Tests for AST-based symbol extraction in the transpilation coordinator.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Parser } from "@gml-modules/parser";
import { extractSymbolsFromAst } from "../src/modules/transpilation/symbol-extraction.js";

describe("Symbol extraction from AST", () => {
    it("should extract function declaration symbols", () => {
        const source = `
            function player_move() {
                x += 5;
            }
            
            function player_jump() {
                vspeed = -10;
            }
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/player.gml");

        assert.ok(symbols.includes("gml_Script_player_move"), "Should extract player_move function");
        assert.ok(symbols.includes("gml_Script_player_jump"), "Should extract player_jump function");
        assert.strictEqual(symbols.length, 2, "Should extract exactly 2 symbols");
    });

    it("should extract variable declarator function assignments", () => {
        const source = `
            var myFunc = function() {
                return 42;
            };
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/test.gml");

        assert.ok(symbols.includes("gml_Script_myFunc"), "Should extract myFunc from variable declarator");
        assert.strictEqual(symbols.length, 1, "Should extract exactly 1 symbol");
    });

    it("should extract assignment expression function assignments", () => {
        const source = `
            myHandler = function() {
                show_debug_message("handled");
            };
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/handlers.gml");

        assert.ok(symbols.includes("gml_Script_myHandler"), "Should extract myHandler from assignment");
        assert.strictEqual(symbols.length, 1, "Should extract exactly 1 symbol");
    });

    it("should detect object event files correctly", () => {
        const source = `
            function onCreate() {
                hp = 100;
            }
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "objects/obj_player/Create_0.gml");

        assert.ok(
            symbols.includes("gml_Object_obj_player_Create_0"),
            "Should use object naming for object event files"
        );
    });

    it("should handle empty files gracefully", () => {
        const source = ``;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/empty.gml");

        assert.strictEqual(symbols.length, 0, "Should return empty array for empty files");
    });

    it("should handle files with only comments gracefully", () => {
        const source = `
            // This is a comment
            /* Multi-line
               comment */
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/comments.gml");

        assert.strictEqual(symbols.length, 0, "Should return empty array for comment-only files");
    });

    it("should deduplicate symbols if the same name appears multiple times", () => {
        const source = `
            function test() { }
            var test = function() { };
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/duplicate.gml");

        assert.ok(symbols.includes("gml_Script_test"), "Should extract test symbol");
        assert.strictEqual(symbols.length, 1, "Should deduplicate the same symbol");
    });

    it("should handle mixed function declarations and expressions", () => {
        const source = `
            function declared() {
                return 1;
            }
            
            var assigned = function() {
                return 2;
            };
            
            handler = function() {
                return 3;
            };
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/mixed.gml");

        assert.ok(symbols.includes("gml_Script_declared"), "Should extract declared function");
        assert.ok(symbols.includes("gml_Script_assigned"), "Should extract assigned variable");
        assert.ok(symbols.includes("gml_Script_handler"), "Should extract handler assignment");
        assert.strictEqual(symbols.length, 3, "Should extract all 3 symbols");
    });

    it("should ignore non-function variable declarators", () => {
        const source = `
            var x = 10;
            var y = "test";
            var z = [1, 2, 3];
            
            function actual_func() {
                return 42;
            }
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/mixed_vars.gml");

        assert.ok(symbols.includes("gml_Script_actual_func"), "Should extract actual function");
        assert.strictEqual(symbols.length, 1, "Should only extract function, not other variables");
    });

    it("should ignore non-function assignments", () => {
        const source = `
            x = 10;
            name = "test";
            
            myFunc = function() {
                return 42;
            };
        `;

        const parser = new Parser.GMLParser(source, {});
        const ast = parser.parse();
        const symbols = extractSymbolsFromAst(ast, "scripts/assignments.gml");

        assert.ok(symbols.includes("gml_Script_myFunc"), "Should extract function assignment");
        assert.strictEqual(symbols.length, 1, "Should only extract function assignment");
    });
});
