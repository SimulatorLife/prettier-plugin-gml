import assert from "node:assert/strict";
import test from "node:test";
import { Parser } from "@gml-modules/parser";
import { Transpiler } from "../index.js";

type SemOracle = ConstructorParameters<typeof Transpiler.GmlToJsEmitter>[0];

test("GmlToJsEmitter handles number literals in AST", () => {
    const source = "42";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("42"), "Should include the number 42");
});

test("GmlToJsEmitter handles string literals in AST", () => {
    const source = '"hello world"';
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("hello world"),
        "Should include the string content"
    );
});

test("GmlToJsEmitter handles boolean literals in AST", () => {
    const source = "true";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("true"), "Should include the boolean true");
});

test("GmlToJsEmitter handles identifiers in AST", () => {
    const source = "myVariable";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("myVariable"), "Should include the identifier");
});

test("GmlToJsEmitter handles simple binary expressions in AST", () => {
    const source = "x = 1 + 2";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("x = (1 + 2)"),
        "Should include the full expression"
    );
});

test("GmlToJsEmitter maps GML div operator to JavaScript division", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("div"), "/");
});

test("GmlToJsEmitter maps GML mod operator to JavaScript modulo", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("mod"), "%");
});

test("GmlToJsEmitter maps GML and operator to JavaScript &&", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("and"), "&&");
});

test("GmlToJsEmitter maps GML or operator to JavaScript ||", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("or"), "||");
});

test("GmlToJsEmitter maps GML not operator to JavaScript !", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapUnaryOperator("not"), "!");
});

test("GmlToJsEmitter maps == to === for strict equality", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("=="), "===");
});

test("GmlToJsEmitter maps != to !== for strict inequality", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("!="), "!==");
});

test("GmlToJsEmitter maps bitwise AND operator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("&"), "&");
});

test("GmlToJsEmitter maps bitwise OR operator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("|"), "|");
});

test("GmlToJsEmitter maps bitwise XOR operator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("xor"), "^");
});

test("GmlToJsEmitter maps left shift operator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("<<"), "<<");
});

test("GmlToJsEmitter maps right shift operator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator(">>"), ">>");
});

test("GmlToJsEmitter preserves standard JavaScript operators", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("+"), "+");
    assert.equal(emitter.mapOperator("-"), "-");
    assert.equal(emitter.mapOperator("*"), "*");
    assert.equal(emitter.mapOperator("/"), "/");
});

test("Transpiler.emitJavaScript exports a function", () => {
    assert.equal(typeof Transpiler.emitJavaScript, "function");
});

test("Transpiler.emitJavaScript handles empty AST gracefully", () => {
    const result = Transpiler.emitJavaScript(null);
    assert.equal(result, "");
});

test("Transpiler.emitJavaScript returns empty string for unsupported node types", () => {
    const ast = {
        type: "UnsupportedNode"
    } as unknown as Parameters<typeof Transpiler.emitJavaScript>[0];
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result, "");
});

test("Transpiler.emitJavaScript handles array access (MemberIndexExpression)", () => {
    const source = "x = arr[0]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("arr[0]"), "Should emit array access syntax");
    assert.ok(result.includes("="), "Should include assignment");
});

test("Transpiler.emitJavaScript handles multi-dimensional array access", () => {
    const source = "x = matrix[i][j]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("matrix[i][j]"),
        "Should emit nested array access"
    );
});

test("Transpiler.emitJavaScript handles property access (MemberDotExpression)", () => {
    const source = "x = obj.prop";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("obj.prop"),
        "Should emit property access syntax"
    );
});

test("Transpiler.emitJavaScript handles function calls (CallExpression)", () => {
    const source = "result = func()";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("func()"), "Should emit function call syntax");
});

test("Transpiler.emitJavaScript handles function calls with arguments", () => {
    const source = "result = func(1, 2, 3)";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("func(") &&
            result.includes("1") &&
            result.includes("2"),
        "Should emit function call with arguments"
    );
});

test("GmlToJsEmitter routes script calls through the wrapper helper", () => {
    const source = "result = scr_attack(target)";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const sem: SemOracle = {
        ...Transpiler.makeDummyOracle(),
        callTargetKind(node) {
            if (
                node.object?.type === "Identifier" &&
                node.object.name === "scr_attack"
            ) {
                return "script";
            }
            return "unknown";
        },
        callTargetSymbol(node) {
            if (
                node.object?.type === "Identifier" &&
                node.object.name === "scr_attack"
            ) {
                return "gml/script/scr_attack";
            }
            return null;
        }
    };
    const emitter = new Transpiler.GmlToJsEmitter(sem);
    const result = emitter.emit(ast);

    assert.ok(
        result.includes(
            '__call_script("gml/script/scr_attack", self, other, [target])'
        ),
        "Should call scripts through __call_script helper"
    );
});

test("GmlToJsEmitter allows overriding the script call helper name", () => {
    const source = "scr_attack()";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const sem: SemOracle = {
        ...Transpiler.makeDummyOracle(),
        callTargetKind() {
            return "script";
        },
        callTargetSymbol() {
            return "gml/script/scr_attack";
        }
    };
    const emitter = new Transpiler.GmlToJsEmitter(sem, {
        callScriptIdent: "__runtime_call"
    });
    const result = emitter.emit(ast);

    assert.ok(
        result.includes('__runtime_call("gml/script/scr_attack", self, other,'),
        "Should respect the configured script call helper"
    );
    assert.ok(result.includes("[]"), "Should pass an empty argument array");
});

test("Transpiler.emitJavaScript qualifies global identifiers using the global struct", () => {
    const source = "globalvar foo; foo = 1;";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.ok(
        result.includes(
            'if (!Object.prototype.hasOwnProperty.call(globalThis, "foo"))'
        ),
        "Should guard access on the global object"
    );

    assert.ok(
        result.includes("globalThis.foo = undefined;"),
        "Should register global variables on globalThis"
    );

    assert.ok(
        result.includes("global.foo = 1"),
        "Should qualify global identifier references"
    );
});

test("GmlToJsEmitter allows overriding the globals identifier", () => {
    const source = "globalvar foo; foo = 1;";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const emitter = new Transpiler.GmlToJsEmitter(
        Transpiler.makeDummyOracle(),
        {
            globalsIdent: "__globals"
        }
    );

    const result = emitter.emit(ast);

    assert.ok(
        result.includes("__globals.foo = 1"),
        "Should respect the configured globals identifier"
    );
});

// Control flow tests
test("Transpiler.emitJavaScript handles if statements", () => {
    const source = "if (x > 10) { y = 5; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("x"), "Should include condition variable");
    assert.ok(result.includes("y = 5"), "Should include consequent body");
});

test("Transpiler.emitJavaScript handles if-else statements", () => {
    const source = "if (x > 10) { y = 5; } else { y = 0; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("else"), "Should include else keyword");
    assert.ok(result.includes("y = 5"), "Should include then branch");
    assert.ok(result.includes("y = 0"), "Should include else branch");
});

test("Transpiler.emitJavaScript handles else-if chains", () => {
    const source =
        "if (x > 10) { y = 1; } else if (x > 5) { y = 2; } else { y = 3; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("else"), "Should include else keyword");
    assert.ok(result.includes("y = 1"), "Should include first branch");
    assert.ok(result.includes("y = 2"), "Should include second branch");
    assert.ok(result.includes("y = 3"), "Should include third branch");
});

test("Transpiler.emitJavaScript handles if without braces", () => {
    const source = "if (x > 10) y = 5";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("y = 5"), "Should include statement");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should add braces"
    );
});

test("Transpiler.emitJavaScript handles for loops", () => {
    const source = "for (var i = 0; i < 10; i += 1) { x += i; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("var i = 0"), "Should include initialization");
    assert.ok(result.includes("i < 10"), "Should include test condition");
    assert.ok(result.includes("i += 1"), "Should include update");
    assert.ok(result.includes("x += i"), "Should include body");
});

test("Transpiler.emitJavaScript handles for loop without var keyword", () => {
    const source = "for (i = 0; i < 10; i += 1) { x += i; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("i = 0"), "Should include initialization");
    assert.ok(result.includes("i < 10"), "Should include test condition");
});

test("Transpiler.emitJavaScript handles while loops", () => {
    const source = "while (x > 0) { x -= 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("x > 0"), "Should include test condition");
    assert.ok(result.includes("x -= 1"), "Should include body");
});

test("Transpiler.emitJavaScript handles while loop without braces", () => {
    const source = "while (x > 0) x -= 1";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("x -= 1"), "Should include statement");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should add braces"
    );
});

test("Transpiler.emitJavaScript handles with statements with block bodies", () => {
    const source = "with (obj_enemy) { hp -= 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.ok(
        result.includes("__resolve_with_targets"),
        "Should resolve with targets through helper"
    );
    assert.ok(
        result.includes("const __with_prev_self = self"),
        "Should capture previous self binding"
    );
    assert.ok(
        result.includes("self = __with_self"),
        "Should assign new self value for each target"
    );
    assert.ok(
        result.includes("other = __with_prev_self"),
        "Should expose previous self as other"
    );
    assert.ok(result.includes("hp -= 1"), "Should emit loop body");
});

test("Transpiler.emitJavaScript wraps with statements without braces", () => {
    const source = "with (obj_enemy) hp -= 1";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.ok(
        result.includes("with_prev_self"),
        "Should manage scope bindings"
    );
    assert.ok(
        result.includes("        {\n        hp -= 1;\n        }"),
        "Should wrap single statements in a block"
    );
});

test("Transpiler.emitJavaScript handles variable declarations", () => {
    const source = "var x = 10";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("var x = 10"), "Should include var declaration");
});

test("Transpiler.emitJavaScript handles multiple variable declarations", () => {
    const source = "var x = 10, y = 20, z = 30";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("var"), "Should include var keyword");
    assert.ok(result.includes("x = 10"), "Should include first declaration");
    assert.ok(result.includes("y = 20"), "Should include second declaration");
    assert.ok(result.includes("z = 30"), "Should include third declaration");
});

test("Transpiler.emitJavaScript handles variable declaration without initialization", () => {
    const source = "var x";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("var x"), "Should include variable name");
});

test("Transpiler.emitJavaScript lowers globalvar declarations into guarded globals", () => {
    const source = "globalvar foo, bar;";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.match(
        result,
        /Object\.prototype\.hasOwnProperty\.call\(globalThis, "foo"\)/,
        "Should guard against reinitialising foo"
    );
    assert.match(
        result,
        /globalThis\.foo = undefined;/,
        "Should initialise foo on the global object"
    );
    assert.match(
        result,
        /Object\.prototype\.hasOwnProperty\.call\(globalThis, "bar"\)/,
        "Should guard against reinitialising bar"
    );
    assert.match(
        result,
        /globalThis\.bar = undefined;/,
        "Should initialise bar on the global object"
    );
});

test("Transpiler.emitJavaScript preserves subsequent statements after globalvar", () => {
    const source = "globalvar foo;\nfoo = 5;";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.ok(
        result.includes("foo = 5"),
        "Should keep assignments following the globalvar declaration"
    );
});

test("Transpiler.emitJavaScript handles nested control flow", () => {
    const source = "if (x > 0) { for (var i = 0; i < x; i += 1) { y += i; } }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("y += i"), "Should include nested body");
});

test("Transpiler.emitJavaScript handles parenthesized expressions in assignments", () => {
    const source = "result = (x + y) * z";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("(x + y)"), "Should preserve parenthesization");
    assert.ok(result.includes("* z"), "Should include multiplication");
});

test("Transpiler.emitJavaScript handles return statements with value", () => {
    const source = "return x + y";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("return"), "Should include return keyword");
    assert.ok(result.includes("x + y"), "Should include return value");
});

test("Transpiler.emitJavaScript handles return statement without value", () => {
    const source = "return";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result.trim(), "return;", "Should emit return statement");
});

test("Transpiler.emitJavaScript handles break statements", () => {
    const source = "break";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result.trim(), "break;", "Should emit break statement");
});

test("Transpiler.emitJavaScript handles continue statements", () => {
    const source = "continue";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result.trim(), "continue;", "Should emit continue statement");
});

test("Transpiler.emitJavaScript handles postfix increment statements", () => {
    const source = "i++";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result.trim(), "i++;", "Should emit postfix increment");
});

test("Transpiler.emitJavaScript handles prefix increment expressions", () => {
    const source = "var x = ++i";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("var x = ++i"), "Should emit prefix increment");
});

test("Transpiler.emitJavaScript handles postfix decrement on member access", () => {
    const source = "arr[i]--";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("arr[i]--"), "Should emit member decrement");
});

test("Transpiler.emitJavaScript lowers exit statements to return", () => {
    const source = "exit";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.equal(result.trim(), "return;", "Should emit return for exit");
});

test("Transpiler.emitJavaScript handles do-until loops", () => {
    const source = "do { x += 1; } until (x > 10)";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("do"), "Should include do keyword");
    assert.ok(result.includes("while"), "Should convert until to while");
    assert.ok(result.includes("!"), "Should negate the condition");
    assert.ok(result.includes("x += 1"), "Should include body");
});

test("Transpiler.emitJavaScript handles switch statements", () => {
    const source = "switch (x) { case 1: y = 1; break; case 2: y = 2; break; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("switch"), "Should include switch keyword");
    assert.ok(result.includes("case 1"), "Should include first case");
    assert.ok(result.includes("case 2"), "Should include second case");
    assert.ok(result.includes("break"), "Should include break statements");
});

test("Transpiler.emitJavaScript handles switch with default case", () => {
    const source = "switch (x) { case 1: y = 1; break; default: y = 0; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("switch"), "Should include switch keyword");
    assert.ok(result.includes("case 1"), "Should include case");
    assert.ok(result.includes("default"), "Should include default case");
});

test("Transpiler.emitJavaScript handles for loop with break", () => {
    const source = "for (var i = 0; i < 10; i += 1) { if (i == 5) break; }";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for keyword");
    assert.ok(result.includes("if"), "Should include if keyword");
    assert.ok(result.includes("break"), "Should include break");
});

test("Transpiler.emitJavaScript handles while loop with continue", () => {
    const source = "while (x > 0) { if (x % 2 == 0) continue; x -= 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("while"), "Should include while keyword");
    assert.ok(result.includes("continue"), "Should include continue");
});

// Repeat statement tests
test("Transpiler.emitJavaScript handles repeat statements", () => {
    const source = "repeat (5) { x += 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(
        result.includes("__repeat_count"),
        "Should use __repeat_count variable"
    );
    assert.ok(result.includes("5"), "Should include repeat count");
    assert.ok(result.includes("x += 1"), "Should include body");
});

test("Transpiler.emitJavaScript handles repeat with variable count", () => {
    const source = "repeat (n) { total += 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(result.includes("n"), "Should include variable count");
    assert.ok(result.includes("total += 1"), "Should include body");
});

test("Transpiler.emitJavaScript handles repeat with expression count", () => {
    const source = "repeat (x + y) { z += 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(
        result.includes("x") && result.includes("y"),
        "Should include expression"
    );
});

test("Transpiler.emitJavaScript handles repeat without braces", () => {
    const source = "repeat (3) x += 1";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should add braces"
    );
});

test("Transpiler.emitJavaScript handles nested repeat statements", () => {
    const source = "repeat (x) { repeat (y) { z += 1; } }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should include for loops");
    assert.ok(result.includes("x"), "Should include outer count");
    assert.ok(result.includes("y"), "Should include inner count");
});

test("Transpiler.emitJavaScript handles repeat with break", () => {
    const source = "repeat (10) { if (x > 5) break; x += 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(result.includes("break"), "Should include break");
});

test("Transpiler.emitJavaScript handles repeat with continue", () => {
    const source = "repeat (10) { if (x % 2 == 0) continue; x += 1; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("for"), "Should convert to for loop");
    assert.ok(result.includes("continue"), "Should include continue");
});

// Array and struct literal tests
test("Transpiler.emitJavaScript handles empty array literals", () => {
    const source = "x = []";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("x = []"), "Should emit empty array literal");
});

test("Transpiler.emitJavaScript handles array literals with elements", () => {
    const source = "x = [1, 2, 3]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("[1, 2, 3]"), "Should emit array literal");
});

test("Transpiler.emitJavaScript handles array literals with expressions", () => {
    const source = "x = [a + b, c * d, 5]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("[") && result.includes("]"),
        "Should emit array literal"
    );
    assert.ok(result.includes("a"), "Should include expression");
});

test("Transpiler.emitJavaScript handles nested array literals", () => {
    const source = "x = [[1, 2], [3, 4]]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("[[") && result.includes("]]"),
        "Should emit nested arrays"
    );
});

test("Transpiler.emitJavaScript handles empty struct literals", () => {
    const source = "x = {}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("{}"), "Should emit empty struct literal");
});

test("Transpiler.emitJavaScript handles struct literals with properties", () => {
    const source = "x = {a: 1, b: 2}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("a: 1"), "Should include first property");
    assert.ok(result.includes("b: 2"), "Should include second property");
});

test("Transpiler.emitJavaScript handles struct literals with string keys", () => {
    const source = 'x = {name: "player", hp: 100}';
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("name:"), "Should include name property");
    assert.ok(result.includes("hp:"), "Should include hp property");
});

test("Transpiler.emitJavaScript handles struct literals with expression values", () => {
    const source = "x = {total: a + b, half: n / 2}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("total:"), "Should include total property");
    assert.ok(result.includes("half:"), "Should include half property");
});

test("Transpiler.emitJavaScript handles nested struct literals", () => {
    const source = "x = {outer: {inner: 42}}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("outer:") && result.includes("inner:"),
        "Should emit nested structs"
    );
});

test("Transpiler.emitJavaScript handles structs with array properties", () => {
    const source = "x = {items: [1, 2, 3], name: val}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("items:"), "Should include items property");
    assert.ok(result.includes("[1, 2, 3]"), "Should include array literal");
});

test("Transpiler.emitJavaScript handles arrays with struct elements", () => {
    const source = "x = [{a: 1}, {b: 2}]";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("a: 1"), "Should include first struct");
    assert.ok(result.includes("b: 2"), "Should include second struct");
});

// Enum declaration tests
test("Transpiler.emitJavaScript handles enum declarations with implicit values", () => {
    const source = `enum Colors { red, green = 5, blue }`;
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast).trim();

    const expected = [
        "const Colors = (() => {",
        "    const __enum = {};",
        "    let __value = -1;",
        "    __value += 1;",
        "    __enum.red = __value;",
        "    __value = 5;",
        "    __enum.green = __value;",
        "    __value += 1;",
        "    __enum.blue = __value;",
        "    return __enum;",
        "})();"
    ].join("\n");

    assert.equal(result, expected);
});

test("Transpiler.emitJavaScript handles enum declarations with expressions", () => {
    const source = `enum Foo { bar = 1 + 2, baz, qux = "hi" }`;
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);

    assert.ok(
        result.includes("__value = (1 + 2);"),
        "Should emit initializer expression"
    );
    assert.ok(
        result.includes("__value += 1;\n    __enum.baz = __value;"),
        "Should increment implicit enum value"
    );
    assert.ok(
        result.includes('__value = "hi";'),
        "Should emit string initializer verbatim"
    );
});

// Ternary expression tests
test("Transpiler.emitJavaScript handles simple ternary expressions", () => {
    const source = "x = a > b ? a : b";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("?"), "Should include ? operator");
    assert.ok(result.includes(":"), "Should include : operator");
    assert.ok(result.includes("a > b"), "Should include test condition");
});

test("Transpiler.emitJavaScript handles ternary with parenthesized test", () => {
    const source = "x = (a > b) ? a : b";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("?"), "Should include ternary operator");
    assert.ok(result.includes("a"), "Should include consequent");
    assert.ok(result.includes("b"), "Should include alternate");
});

test("Transpiler.emitJavaScript handles nested ternary expressions", () => {
    const source = "x = a > b ? (c > d ? c : d) : b";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("?"), "Should include ternary operators");
});

test("Transpiler.emitJavaScript handles ternary with complex expressions", () => {
    const source = "result = (x + y) > 10 ? x * 2 : y / 2";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("?"), "Should include ternary operator");
    assert.ok(result.includes("x + y"), "Should include test expression");
    assert.ok(result.includes("x * 2"), "Should include consequent");
    assert.ok(result.includes("y / 2"), "Should include alternate");
});

test("Transpiler.emitJavaScript handles ternary with function calls", () => {
    const source = "x = check() ? getValue() : getDefault()";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("check()"), "Should include test function");
    assert.ok(
        result.includes("getValue()"),
        "Should include consequent function"
    );
    assert.ok(
        result.includes("getDefault()"),
        "Should include alternate function"
    );
});

// Error handling tests
test("Transpiler.emitJavaScript handles throw statements with string", () => {
    const source = 'throw "Error message"';
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("throw"), "Should include throw keyword");
    assert.ok(result.includes("Error message"), "Should include error message");
});

test("Transpiler.emitJavaScript handles throw statements with expression", () => {
    const source = "throw new_error(code)";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("throw"), "Should include throw keyword");
    assert.ok(result.includes("new_error"), "Should include expression");
});

test("Transpiler.emitJavaScript handles try-catch statements", () => {
    const source = "try { risky(); } catch (e) { handle(e); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("try"), "Should include try keyword");
    assert.ok(result.includes("catch"), "Should include catch keyword");
    assert.ok(result.includes("risky()"), "Should include try block");
    assert.ok(result.includes("handle(e)"), "Should include catch block");
});

test("Transpiler.emitJavaScript handles try-catch without parameter", () => {
    const source = "try { code(); } catch { recover(); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("try"), "Should include try keyword");
    assert.ok(result.includes("catch"), "Should include catch keyword");
    assert.ok(
        result.includes("err") || result.includes("("),
        "Should provide default parameter"
    );
});

test("Transpiler.emitJavaScript handles try-finally statements", () => {
    const source = "try { code(); } finally { cleanup(); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("try"), "Should include try keyword");
    assert.ok(result.includes("finally"), "Should include finally keyword");
    assert.ok(result.includes("cleanup()"), "Should include finally block");
});

test("Transpiler.emitJavaScript handles try-catch-finally statements", () => {
    const source =
        "try { risky(); } catch (e) { handle(e); } finally { cleanup(); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("try"), "Should include try keyword");
    assert.ok(result.includes("catch"), "Should include catch keyword");
    assert.ok(result.includes("finally"), "Should include finally keyword");
    assert.ok(result.includes("risky()"), "Should include try block");
    assert.ok(result.includes("handle(e)"), "Should include catch block");
    assert.ok(result.includes("cleanup()"), "Should include finally block");
});

test("Transpiler.emitJavaScript handles nested try-catch blocks", () => {
    const source =
        "try { try { inner(); } catch (e) { log(e); } } catch (e) { outer(e); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(result.includes("try"), "Should include try keywords");
    assert.ok(result.includes("inner()"), "Should include inner try block");
    assert.ok(result.includes("outer(e)"), "Should include outer catch block");
});

test("Transpiler.emitJavaScript handles function declarations without parameters", () => {
    const source = "function myFunction() { return 42; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function myFunction"),
        "Should include function keyword and name"
    );
    assert.ok(result.includes("()"), "Should include empty parameter list");
    assert.ok(result.includes("return 42"), "Should include function body");
});

test("Transpiler.emitJavaScript handles function declarations with parameters", () => {
    const source = "function add(a, b) { return a + b; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function add"),
        "Should include function keyword and name"
    );
    assert.ok(result.includes("(a, b)"), "Should include parameters");
    assert.ok(result.includes("return"), "Should include return statement");
    assert.ok(
        result.includes("a + b") || result.includes("(a + b)"),
        "Should include addition operation"
    );
});

test("Transpiler.emitJavaScript handles function declarations with multiple statements", () => {
    const source = "function process(x) { var y = x * 2; return y; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function process"),
        "Should include function name"
    );
    assert.ok(result.includes("(x)"), "Should include parameter");
    assert.ok(result.includes("var y"), "Should include variable declaration");
    assert.ok(result.includes("return y"), "Should include return statement");
});

test("Transpiler.emitJavaScript handles function declarations with empty body", () => {
    const source = "function emptyFunc() {}";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function emptyFunc"),
        "Should include function name"
    );
    assert.ok(result.includes("()"), "Should include empty parameter list");
    assert.ok(
        result.includes("{") && result.includes("}"),
        "Should include braces for body"
    );
});

test("Transpiler.emitJavaScript handles function declarations with control flow", () => {
    const source =
        "function checkValue(val) { if (val > 0) { return true; } return false; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function checkValue"),
        "Should include function name"
    );
    assert.ok(result.includes("if"), "Should include if statement");
    assert.ok(
        result.includes("return true"),
        "Should include conditional return"
    );
    assert.ok(result.includes("return false"), "Should include default return");
});

test("Transpiler.emitJavaScript handles nested function declarations", () => {
    const source =
        "function outer() { function inner() { return 1; } return inner(); }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function outer"),
        "Should include outer function"
    );
    assert.ok(
        result.includes("function inner"),
        "Should include inner function"
    );
    assert.ok(
        result.includes("return inner()"),
        "Should include inner function call"
    );
});

test("Transpiler.emitJavaScript handles function with many parameters", () => {
    const source =
        "function multiParam(a, b, c, d, e) { return a + b + c + d + e; }";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("function multiParam"),
        "Should include function name"
    );
    assert.ok(
        result.includes("a, b, c, d, e"),
        "Should include all parameters"
    );
    assert.ok(result.includes("return"), "Should include return statement");
});

test("Transpiler.emitJavaScript handles built-in function mapping for point_distance", () => {
    const source = "dist = point_distance(0, 0, 10, 10)";
    const parser = new Parser.GMLParser(source, {});
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("Math.sqrt"),
        "Should include Math.sqrt for point_distance"
    );
    assert.ok(
        result.includes("Math.pow(10 - 0, 2) + Math.pow(10 - 0, 2)"),
        "Should include the correct distance calculation"
    );
});

test("Transpiler.emitJavaScript handles built-in function mapping for abs", () => {
    const source = "val = abs(-10)";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("Math.abs(-10)"),
        "Should include Math.abs for abs"
    );
});

test("Transpiler.emitJavaScript handles built-in function mapping for min", () => {
    const source = "val = min(1, 2, 3)";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("Math.min(1, 2, 3)"),
        "Should include Math.min for min"
    );
});

test("Transpiler.emitJavaScript handles built-in function mapping for max", () => {
    const source = "val = max(1, 2, 3)";
    const parser = new Parser.GMLParser(source);
    const ast = parser.parse();
    const result = Transpiler.emitJavaScript(ast);
    assert.ok(
        result.includes("Math.max(1, 2, 3)"),
        "Should include Math.max for max"
    );
});
