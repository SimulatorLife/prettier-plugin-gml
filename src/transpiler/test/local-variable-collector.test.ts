import assert from "node:assert/strict";
import test from "node:test";

import { Parser } from "@gml-modules/parser";

import type { GmlNode } from "../src/emitter/ast.js";
import { collectLocalVariables } from "../src/emitter/local-variable-collector.js";

/**
 * Parse a GML snippet into a ProgramNode for use in collector tests.
 * The parser always returns a ProgramNode for valid input, so the cast is safe.
 */
function parse(source: string): GmlNode {
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    if (!ast || typeof ast !== "object" || !("type" in ast)) {
        throw new TypeError("Parser did not return a valid AST node");
    }
    return ast as GmlNode;
}

void test("collectLocalVariables returns empty set for empty program", () => {
    const ast = parse("");
    const locals = collectLocalVariables(ast);
    assert.equal(locals.size, 0, "Empty program should have no locals");
});

void test("collectLocalVariables returns empty set for null", () => {
    const locals = collectLocalVariables(null);
    assert.equal(locals.size, 0);
});

void test("collectLocalVariables collects simple var declarations", () => {
    const ast = parse("var x = 5;");
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("x"), "Should include var x");
});

void test("collectLocalVariables collects multiple var declarations in one statement", () => {
    const ast = parse("var a = 1, b = 2, c = 3;");
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("a"), "Should include a");
    assert.ok(locals.has("b"), "Should include b");
    assert.ok(locals.has("c"), "Should include c");
});

void test("collectLocalVariables collects var declarations at different nesting levels", () => {
    const ast = parse(`
        var speed = 5;
        if (true) {
            var dx = 10;
        }
        for (var i = 0; i < 10; i += 1) {
            var inner = i * 2;
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("speed"), "Should include speed");
    assert.ok(locals.has("dx"), "Should include dx inside if");
    assert.ok(locals.has("i"), "Should include for-loop var");
    assert.ok(locals.has("inner"), "Should include var inside for body");
});

void test("collectLocalVariables does NOT collect vars in nested function declarations", () => {
    const ast = parse(`
        var outer = 1;
        function nested() {
            var inner = 2;
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("outer"), "Should include outer");
    assert.equal(locals.has("inner"), false, "Should NOT include inner (nested function scope)");
});

void test("collectLocalVariables does NOT collect vars in nested constructor declarations", () => {
    const ast = parse(`
        var top = 1;
        function MyStruct() constructor {
            var member = 2;
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("top"), "Should include top-level var");
    assert.equal(locals.has("member"), false, "Should NOT include vars in constructors");
});

void test("collectLocalVariables collects declarations without initializers", () => {
    const ast = parse("var x;");
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("x"), "Should collect uninitialized var declarations");
});

void test("collectLocalVariables returns unique names even if declared multiple times", () => {
    const ast = parse("var x = 1; var x = 2;");
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("x"), "Should include x");
    assert.equal(locals.size, 1, "Should only have one entry for x");
});

void test("collectLocalVariables handles deeply nested var declarations", () => {
    const ast = parse(`
        if (alive) {
            while (moving) {
                var step = 1;
            }
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("step"), "Should collect deeply nested var declarations");
});

void test("collectLocalVariables does not collect non-var identifiers", () => {
    const ast = parse("x = 1; y += 2; someFunc();");
    const locals = collectLocalVariables(ast);
    assert.equal(locals.has("x"), false, "Should not collect assignment targets");
    assert.equal(locals.has("y"), false, "Should not collect compound assignment targets");
    assert.equal(locals.has("someFunc"), false, "Should not collect function call names");
});

void test("collectLocalVariables collects vars from switch cases", () => {
    const ast = parse(`
        switch (state) {
            case 1:
                var result = "one";
                break;
            case 2:
                var result = "two";
                break;
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("result"), "Should collect var declared in switch cases");
});

void test("collectLocalVariables collects vars from try-catch blocks", () => {
    const ast = parse(`
        try {
            var attempt = doSomething();
        } catch (err) {
            var failed = true;
        }
    `);
    const locals = collectLocalVariables(ast);
    assert.ok(locals.has("attempt"), "Should collect var in try block");
    assert.ok(locals.has("failed"), "Should collect var in catch block");
});
