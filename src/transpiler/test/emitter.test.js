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

test("emitJavaScript handles array access (MemberIndexExpression)", () => {
    const source = "x = arr[0]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("arr[0]"), "Should emit array access syntax");
    assert.ok(result.includes("="), "Should include assignment");
});

test("emitJavaScript handles multi-dimensional array access", () => {
    const source = "x = matrix[i][j]";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(
        result.includes("matrix[") && result.includes("]["),
        "Should emit nested array access"
    );
});

test("emitJavaScript handles property access (MemberDotExpression)", () => {
    const source = "x = obj.prop";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(
        result.includes("obj.prop"),
        "Should emit property access syntax"
    );
});

test("emitJavaScript handles function calls (CallExpression)", () => {
    const source = "result = func()";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("func()"), "Should emit function call syntax");
});

test("emitJavaScript handles function calls with arguments", () => {
    const source = "result = func(1, 2, 3)";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(
        result.includes("func(") &&
            result.includes("1") &&
            result.includes("2"),
        "Should emit function call with arguments"
    );
});

// Control flow tests
test("emitJavaScript handles if statements", () => {
    const source = "if (x > 10) { y = 5; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("x"), "Should include condition variable");
    assert.ok(result.includes("y = 5"), "Should include consequent body");
});

test("emitJavaScript handles if-else statements", () => {
    const source = "if (x > 10) { y = 5; } else { y = 0; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("else"), "Should include else keyword");
    assert.ok(result.includes("y = 5"), "Should include then branch");
    assert.ok(result.includes("y = 0"), "Should include else branch");
});

test("emitJavaScript handles else-if chains", () => {
    const source =
        "if (x > 10) { y = 1; } else if (x > 5) { y = 2; } else { y = 3; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("else"), "Should include else keyword");
    assert.ok(result.includes("y = 1"), "Should include first branch");
    assert.ok(result.includes("y = 2"), "Should include second branch");
    assert.ok(result.includes("y = 3"), "Should include third branch");
});

test("emitJavaScript handles if without braces", () => {
    const source = "if (x > 10) y = 5";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("y = 5"), "Should include statement");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should add braces"
    );
});

test("emitJavaScript handles for loops", () => {
    const source = "for (var i = 0; i < 10; i += 1) { x += i; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("var i = 0"), "Should include initialization");
    assert.ok(result.includes("i < 10"), "Should include test condition");
    assert.ok(result.includes("i += 1"), "Should include update");
    assert.ok(result.includes("x += i"), "Should include body");
});

test("emitJavaScript handles for loop without var keyword", () => {
    const source = "for (i = 0; i < 10; i += 1) { x += i; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("i = 0"), "Should include initialization");
    assert.ok(result.includes("i < 10"), "Should include test condition");
});

test("emitJavaScript handles while loops", () => {
    const source = "while (x > 0) { x -= 1; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("x > 0"), "Should include test condition");
    assert.ok(result.includes("x -= 1"), "Should include body");
});

test("emitJavaScript handles while loop without braces", () => {
    const source = "while (x > 0) x -= 1";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("x -= 1"), "Should include statement");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should add braces"
    );
});

test("emitJavaScript handles variable declarations", () => {
    const source = "var x = 10";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("var"), "Should include var keyword");
    assert.ok(result.includes("x"), "Should include variable name");
    assert.ok(result.includes("10"), "Should include initial value");
});

test("emitJavaScript handles multiple variable declarations", () => {
    const source = "var x = 10, y = 20, z = 30";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("var"), "Should include var keyword");
    assert.ok(result.includes("x = 10"), "Should include first declaration");
    assert.ok(result.includes("y = 20"), "Should include second declaration");
    assert.ok(result.includes("z = 30"), "Should include third declaration");
});

test("emitJavaScript handles variable declaration without initialization", () => {
    const source = "var x";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("var"), "Should include var keyword");
    assert.ok(result.includes("x"), "Should include variable name");
});

test("emitJavaScript handles nested control flow", () => {
    const source = "if (x > 0) { for (var i = 0; i < x; i += 1) { y += i; } }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("y += i"), "Should include nested body");
});

test("emitJavaScript handles parenthesized expressions in assignments", () => {
    const source = "result = (x + y) * z";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("(x + y)"), "Should preserve parenthesization");
    assert.ok(result.includes("* z"), "Should include multiplication");
});

test("emitJavaScript handles return statements with value", () => {
    const source = "return x + y";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("return"), "Should include return keyword");
    assert.ok(result.includes("x + y"), "Should include return value");
});

test("emitJavaScript handles return statement without value", () => {
    const source = "return";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.equal(result.trim(), "return;", "Should emit return statement");
});

test("emitJavaScript handles break statements", () => {
    const source = "break";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.equal(result.trim(), "break;", "Should emit break statement");
});

test("emitJavaScript handles continue statements", () => {
    const source = "continue";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.equal(result.trim(), "continue;", "Should emit continue statement");
});

test("emitJavaScript handles do-until loops", () => {
    const source = "do { x += 1; } until (x > 10)";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("do"), "Should include do keyword");
    assert.ok(result.includes("while"), "Should convert until to while");
    assert.ok(result.includes("!"), "Should negate the condition");
    assert.ok(result.includes("x += 1"), "Should include body");
});

test("emitJavaScript handles switch statements", () => {
    const source = "switch (x) { case 1: y = 1; break; case 2: y = 2; break; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("switch"), "Should include switch keyword");
    assert.ok(result.includes("case 1"), "Should include first case");
    assert.ok(result.includes("case 2"), "Should include second case");
    assert.ok(result.includes("break"), "Should include break statements");
});

test("emitJavaScript handles switch with default case", () => {
    const source = "switch (x) { case 1: y = 1; break; default: y = 0; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("switch"), "Should include switch keyword");
    assert.ok(result.includes("case 1"), "Should include case");
    assert.ok(result.includes("default"), "Should include default case");
});

test("emitJavaScript handles for loop with break", () => {
    const source = "for (var i = 0; i < 10; i += 1) { if (i == 5) break; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("break"), "Should include break");
});

test("emitJavaScript handles while loop with continue", () => {
    const source = "while (x > 0) { if (x % 2 == 0) continue; x -= 1; }";
    const parser = new GMLParser(source);
    const ast = parser.parse();
    const result = emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("continue"), "Should include continue");
});
