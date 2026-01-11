import assert from "node:assert/strict";
import test from "node:test";
import { Transpiler } from "../index.js";

// Test binary operator mapping
void test("mapBinaryOperator maps GML div operator to JavaScript division", () => {
    assert.equal(Transpiler.mapBinaryOperator("div"), "/");
});

void test("mapBinaryOperator maps GML mod operator to JavaScript modulo", () => {
    assert.equal(Transpiler.mapBinaryOperator("mod"), "%");
});

void test("mapBinaryOperator maps GML and operator to JavaScript &&", () => {
    assert.equal(Transpiler.mapBinaryOperator("and"), "&&");
});

void test("mapBinaryOperator maps GML or operator to JavaScript ||", () => {
    assert.equal(Transpiler.mapBinaryOperator("or"), "||");
});

void test("mapBinaryOperator maps GML xor operator to JavaScript ^", () => {
    assert.equal(Transpiler.mapBinaryOperator("xor"), "^");
});

void test("mapBinaryOperator maps == to === for strict equality", () => {
    assert.equal(Transpiler.mapBinaryOperator("=="), "===");
});

void test("mapBinaryOperator maps != to !== for strict inequality", () => {
    assert.equal(Transpiler.mapBinaryOperator("!="), "!==");
});

void test("mapBinaryOperator preserves bitwise AND operator", () => {
    assert.equal(Transpiler.mapBinaryOperator("&"), "&");
});

void test("mapBinaryOperator preserves bitwise OR operator", () => {
    assert.equal(Transpiler.mapBinaryOperator("|"), "|");
});

void test("mapBinaryOperator preserves left shift operator", () => {
    assert.equal(Transpiler.mapBinaryOperator("<<"), "<<");
});

void test("mapBinaryOperator preserves right shift operator", () => {
    assert.equal(Transpiler.mapBinaryOperator(">>"), ">>");
});

void test("mapBinaryOperator returns unmapped operators unchanged", () => {
    assert.equal(Transpiler.mapBinaryOperator("+"), "+");
    assert.equal(Transpiler.mapBinaryOperator("-"), "-");
    assert.equal(Transpiler.mapBinaryOperator("*"), "*");
    assert.equal(Transpiler.mapBinaryOperator("/"), "/");
    assert.equal(Transpiler.mapBinaryOperator("%"), "%");
    assert.equal(Transpiler.mapBinaryOperator("<"), "<");
    assert.equal(Transpiler.mapBinaryOperator(">"), ">");
    assert.equal(Transpiler.mapBinaryOperator("<="), "<=");
    assert.equal(Transpiler.mapBinaryOperator(">="), ">=");
    assert.equal(Transpiler.mapBinaryOperator("==="), "===");
    assert.equal(Transpiler.mapBinaryOperator("!=="), "!==");
});

// Test unary operator mapping
void test("mapUnaryOperator maps GML not operator to JavaScript !", () => {
    assert.equal(Transpiler.mapUnaryOperator("not"), "!");
});

void test("mapUnaryOperator preserves bitwise NOT operator", () => {
    assert.equal(Transpiler.mapUnaryOperator("~"), "~");
});

void test("mapUnaryOperator preserves unary negation operator", () => {
    assert.equal(Transpiler.mapUnaryOperator("-"), "-");
});

void test("mapUnaryOperator preserves unary plus operator", () => {
    assert.equal(Transpiler.mapUnaryOperator("+"), "+");
});

void test("mapUnaryOperator returns unmapped operators unchanged", () => {
    assert.equal(Transpiler.mapUnaryOperator("!"), "!");
    assert.equal(Transpiler.mapUnaryOperator("++"), "++");
    assert.equal(Transpiler.mapUnaryOperator("--"), "--");
});

// Test backward compatibility through GmlToJsEmitter methods
void test("GmlToJsEmitter.mapOperator delegates to mapBinaryOperator", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapOperator("div"), "/");
    assert.equal(emitter.mapOperator("mod"), "%");
    assert.equal(emitter.mapOperator("and"), "&&");
    assert.equal(emitter.mapOperator("=="), "===");
});

void test("GmlToJsEmitter.mapUnaryOperator delegates to standalone function", () => {
    const emitter = new Transpiler.GmlToJsEmitter(Transpiler.makeDummyOracle());
    assert.equal(emitter.mapUnaryOperator("not"), "!");
    assert.equal(emitter.mapUnaryOperator("~"), "~");
});
