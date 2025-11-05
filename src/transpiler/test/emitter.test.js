import assert from "node:assert/strict";
import test from "node:test";
import GMLParser from "gamemaker-language-parser";
import { emitJavaScript, GmlEmitter } from "../src/emitter.js";

test("GmlEmitter handles number literals in AST", () => {
    const source = "42";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("42"), "Should include the number 42");
});

test("GmlEmitter handles string literals in AST", () => {
    const source = '"hello world"';
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(
        result.includes("hello world"),
        "Should include the string content"
    );
});

test("GmlEmitter handles boolean literals in AST", () => {
    const source = "true";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("true"), "Should include the boolean true");
});

test("GmlEmitter handles identifiers in AST", () => {
    const source = "myVariable";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("myVariable"), "Should include the identifier");
});

test("GmlEmitter handles simple binary expressions in AST", () => {
    const source = "x = 1 + 2";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("+"), "Should include the addition operator");
    assert.ok(result.includes("1"), "Should include operand 1");
    assert.ok(result.includes("2"), "Should include operand 2");
});

test("GmlEmitter maps GML div operator to JavaScript division", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("div"), "/");
});

test("GmlEmitter maps GML mod operator to JavaScript modulo", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("mod"), "%");
});

test("GmlEmitter maps GML and operator to JavaScript &&", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("and"), "&&");
});

test("GmlEmitter maps GML or operator to JavaScript ||", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("or"), "||");
});

test("GmlEmitter maps GML not operator to JavaScript !", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapUnaryOperator("not"), "!");
});

test("GmlEmitter maps == to === for strict equality", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("=="), "===");
});

test("GmlEmitter maps != to !== for strict inequality", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("!="), "!==");
});

test("GmlEmitter preserves standard JavaScript operators", () => {
    const emitter = new GmlEmitter();
    assert.equal(emitter.mapOperator("+"), "+");
    assert.equal(emitter.mapOperator("-"), "-");
    assert.equal(emitter.mapOperator("*"), "*");
    assert.equal(emitter.mapOperator("/"), "/");
});

test("emitJavaScript exports a function", () => {
    assert.equal(typeof emitJavaScript, "function");
});

test("GmlEmitter constructor initializes correctly", () => {
    const emitter = new GmlEmitter();
    assert.ok(Array.isArray(emitter.output));
    assert.equal(emitter.indentLevel, 0);
});

test("GmlEmitter emit method adds code with indentation", () => {
    const emitter = new GmlEmitter();
    emitter.emit("test();");
    assert.equal(emitter.output[0], "test();");

    emitter.indentLevel = 1;
    emitter.emit("indented();");
    assert.equal(emitter.output[1], "    indented();");
});

test("GmlEmitter getCode returns joined output", () => {
    const emitter = new GmlEmitter();
    emitter.emit("line1();");
    emitter.emit("line2();");
    const code = emitter.getCode();
    assert.equal(code, "line1();\nline2();");
});

test("emitJavaScript handles empty AST gracefully", () => {
    const result = emitJavaScript(null);
    assert.equal(result, "");
});

test("emitJavaScript returns empty string for unsupported node types", () => {
    const ast = { type: "UnsupportedNode" };
    const result = emitJavaScript(ast);
    assert.equal(result, "");
});

test("GmlEmitter handles function calls with no arguments", () => {
    const source = "show_message()";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("show_message()"), "Should include the function call");
});

test("GmlEmitter handles function calls with single argument", () => {
    const source = 'show_debug_message("hello")';
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("show_debug_message"), "Should include function name");
    assert.ok(result.includes("hello"), "Should include argument");
});

test("GmlEmitter handles function calls with multiple arguments", () => {
    const source = "draw_text(x, y, str)";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("draw_text"), "Should include function name");
    assert.ok(result.includes("x"), "Should include first argument");
    assert.ok(result.includes("y"), "Should include second argument");
    assert.ok(result.includes("str"), "Should include third argument");
});

test("GmlEmitter handles nested function calls", () => {
    const source = "draw_text(x, y, string(health))";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("draw_text"), "Should include outer function");
    assert.ok(result.includes("string"), "Should include inner function");
    assert.ok(result.includes("health"), "Should include argument to inner function");
});

test("GmlEmitter handles array literals", () => {
    const source = "[1, 2, 3]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("["), "Should include opening bracket");
    assert.ok(result.includes("]"), "Should include closing bracket");
    assert.ok(result.includes("1"), "Should include first element");
    assert.ok(result.includes("2"), "Should include second element");
    assert.ok(result.includes("3"), "Should include third element");
});

test("GmlEmitter handles empty array literals", () => {
    const source = "[]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("[]"), "Should include empty array");
});

test("GmlEmitter handles nested arrays", () => {
    const source = "[[1, 2], [3, 4]]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("["), "Should include brackets");
    assert.ok(result.includes("1"), "Should include nested elements");
});

test("GmlEmitter handles struct literals", () => {
    const source = "{ x: 10, y: 20 }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("{"), "Should include opening brace");
    assert.ok(result.includes("}"), "Should include closing brace");
    assert.ok(result.includes("x"), "Should include first key");
    assert.ok(result.includes("10"), "Should include first value");
    assert.ok(result.includes("y"), "Should include second key");
    assert.ok(result.includes("20"), "Should include second value");
});

test("GmlEmitter handles empty struct literals", () => {
    const source = "x = {}";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("{}") || result.includes("{ }"), "Should include empty struct");
});

test("GmlEmitter handles member dot access", () => {
    const source = "x = obj.speed";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("obj.speed"), "Should include dot notation");
});

test("GmlEmitter handles chained member access", () => {
    const source = "x = obj.player.health";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("obj"), "Should include root object");
    assert.ok(result.includes("player"), "Should include intermediate property");
    assert.ok(result.includes("health"), "Should include final property");
});

test("GmlEmitter handles array indexing", () => {
    const source = "x = arr[0]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("arr[0]"), "Should include array indexing");
});

test("GmlEmitter handles 2D array indexing", () => {
    const source = "x = grid[i, j]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("grid"), "Should include array name");
    assert.ok(result.includes("i"), "Should include first index");
    assert.ok(result.includes("j"), "Should include second index");
});
