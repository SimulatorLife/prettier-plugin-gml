import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

import type { ProgramNode } from "../src/emitter/ast.js";
import { collectLocalVariables } from "../src/emitter/local-variable-collector.js";

function parseProgram(source: string): ProgramNode {
    return Parser.GMLParser.parse(source) as unknown as ProgramNode;
}

void describe("collectLocalVariables", () => {
    void it("returns empty set for code with no var declarations", () => {
        const ast = parseProgram("x = 10; health -= 1;");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.size, 0);
    });

    void it("collects a single var-declared name", () => {
        const ast = parseProgram("var speed = 5;");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("speed"), true);
        strictEqual(locals.size, 1);
    });

    void it("collects multiple var-declared names from separate declarations", () => {
        const ast = parseProgram("var dx = 1; var dy = 2;");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("dx"), true);
        strictEqual(locals.has("dy"), true);
        strictEqual(locals.size, 2);
    });

    void it("collects multiple names from a single var declaration", () => {
        const ast = parseProgram("var a = 1, b = 2, c = 3;");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("a"), true);
        strictEqual(locals.has("b"), true);
        strictEqual(locals.has("c"), true);
        strictEqual(locals.size, 3);
    });

    void it("collects var declarations inside if blocks (GML function-scoped var)", () => {
        const ast = parseProgram('if (alive) { var msg = "hit"; }');
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("msg"), true);
    });

    void it("collects var declarations inside for loops", () => {
        const ast = parseProgram("for (var i = 0; i < 10; i++) { }");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("i"), true);
    });

    void it("does NOT collect names from nested function declarations", () => {
        const ast = parseProgram("var outer = 1;\nfunction inner() { var inner_local = 2; }");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("outer"), true, "outer should be collected");
        strictEqual(locals.has("inner_local"), false, "inner_local should not be collected");
    });

    void it("does NOT collect names from nested constructor declarations", () => {
        const ast = parseProgram("var base = 1;\nfunction MyClass() constructor { var ctor_local = 2; }");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("base"), true, "base should be collected");
        strictEqual(locals.has("ctor_local"), false, "ctor_local should not be collected");
    });

    void it("handles var declarations without initializers", () => {
        const ast = parseProgram("var uninit;");
        const locals = collectLocalVariables(ast);
        strictEqual(locals.has("uninit"), true);
    });

    void it("handles a realistic event body with mixed declarations", () => {
        const source = [
            "var spd = 5;",
            "var dir = direction;",
            "x += lengthdir_x(spd, dir);",
            "y += lengthdir_y(spd, dir);"
        ].join("\n");
        const ast = parseProgram(source);
        const locals = collectLocalVariables(ast);

        strictEqual(locals.has("spd"), true, "spd is var-declared");
        strictEqual(locals.has("dir"), true, "dir is var-declared");
        strictEqual(locals.has("direction"), false, "direction is an instance field, not var-declared");
        strictEqual(locals.has("x"), false, "x is an instance field, not var-declared");
        strictEqual(locals.has("y"), false, "y is an instance field, not var-declared");
    });
});
