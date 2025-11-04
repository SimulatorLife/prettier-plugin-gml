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
    assert.ok(result.includes("hello world"), "Should include the string content");
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

test("emitJavaScript handles if statement", () => {
    const source = "if (x > 5) { y = 10; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("x"), "Should include test condition");
    assert.ok(result.includes("y"), "Should include consequent body");
});

test("emitJavaScript handles if-else statement", () => {
    const source = "if (x > 5) { y = 10; } else { y = 20; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("else"), "Should include else keyword");
});

test("emitJavaScript handles function declaration", () => {
    const source = "function foo(a, b) { return a + b; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("function"), "Should include function keyword");
    assert.ok(result.includes("foo"), "Should include function name");
    assert.ok(result.includes("a"), "Should include first parameter");
    assert.ok(result.includes("b"), "Should include second parameter");
    assert.ok(result.includes("return"), "Should include return statement");
});

test("emitJavaScript handles return statement with value", () => {
    const source = "function foo() { return 42; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("return"), "Should include return keyword");
    assert.ok(result.includes("42"), "Should include return value");
});

test("emitJavaScript handles function call", () => {
    const source = "foo(1, 2)";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("foo"), "Should include function name");
    assert.ok(result.includes("1"), "Should include first argument");
    assert.ok(result.includes("2"), "Should include second argument");
});
