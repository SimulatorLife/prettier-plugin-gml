import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Parser } from "@gml-modules/parser";
import { Transpiler } from "../index.js";

void describe("Transpiler.emitJavaScript constructor handling", () => {
    void it("converts basic constructor to function", () => {
        const source = "function MyClass() constructor {}";
        const ast = Parser.GMLParser.parse(source);

        const js = Transpiler.emitJavaScript(ast);

        assert.ok(js.includes("function MyClass()"), "Should emit function declaration");
        assert.ok(js.includes("{") && js.includes("}"), "Should include body braces");
    });

    void it("handles constructor with parameters", () => {
        const source = "function Vector2(x, y) constructor { self.x = x; self.y = y; }";
        const ast = Parser.GMLParser.parse(source);

        const js = Transpiler.emitJavaScript(ast);

        assert.ok(js.includes("function Vector2(x, y)"), "Should emit function with parameters");
        assert.ok(js.includes("self.x = x"), "Should include body statements");
    });

    void it("handles constructor with default parameters", () => {
        const source = "function Thing(value = 0) constructor {}";
        const ast = Parser.GMLParser.parse(source);

        const js = Transpiler.emitJavaScript(ast);

        assert.ok(js.includes("function Thing(value = 0)"), "Should handle default parameters");
    });
});
