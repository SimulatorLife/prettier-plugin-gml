import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapBinaryOperator, mapUnaryOperator } from "../src/emitter/operator-mapping.js";

void describe("mapBinaryOperator", () => {
    void it("maps GML div operator to JavaScript division", () => {
        assert.strictEqual(mapBinaryOperator("div"), "/");
    });

    void it("maps GML mod operator to JavaScript modulo", () => {
        assert.strictEqual(mapBinaryOperator("mod"), "%");
    });

    void it("maps GML and operator to JavaScript &&", () => {
        assert.strictEqual(mapBinaryOperator("and"), "&&");
    });

    void it("maps GML or operator to JavaScript ||", () => {
        assert.strictEqual(mapBinaryOperator("or"), "||");
    });

    void it("maps GML xor operator to JavaScript ^", () => {
        assert.strictEqual(mapBinaryOperator("xor"), "^");
    });

    void it("maps == to === for strict equality", () => {
        assert.strictEqual(mapBinaryOperator("=="), "===");
    });

    void it("maps != to !== for strict inequality", () => {
        assert.strictEqual(mapBinaryOperator("!="), "!==");
    });

    void it("preserves bitwise AND operator &", () => {
        assert.strictEqual(mapBinaryOperator("&"), "&");
    });

    void it("preserves bitwise OR operator |", () => {
        assert.strictEqual(mapBinaryOperator("|"), "|");
    });

    void it("preserves left shift operator <<", () => {
        assert.strictEqual(mapBinaryOperator("<<"), "<<");
    });

    void it("preserves right shift operator >>", () => {
        assert.strictEqual(mapBinaryOperator(">>"), ">>");
    });

    void it("passes through standard JavaScript operators unchanged", () => {
        assert.strictEqual(mapBinaryOperator("+"), "+");
        assert.strictEqual(mapBinaryOperator("-"), "-");
        assert.strictEqual(mapBinaryOperator("*"), "*");
        assert.strictEqual(mapBinaryOperator("/"), "/");
        assert.strictEqual(mapBinaryOperator("%"), "%");
        assert.strictEqual(mapBinaryOperator("<"), "<");
        assert.strictEqual(mapBinaryOperator(">"), ">");
        assert.strictEqual(mapBinaryOperator("<="), "<=");
        assert.strictEqual(mapBinaryOperator(">="), ">=");
    });

    void it("passes through unknown operators unchanged", () => {
        assert.strictEqual(mapBinaryOperator("???"), "???");
        assert.strictEqual(mapBinaryOperator("custom_op"), "custom_op");
    });
});

void describe("mapUnaryOperator", () => {
    void it("maps GML not operator to JavaScript !", () => {
        assert.strictEqual(mapUnaryOperator("not"), "!");
    });

    void it("preserves bitwise NOT operator ~", () => {
        assert.strictEqual(mapUnaryOperator("~"), "~");
    });

    void it("preserves unary minus operator -", () => {
        assert.strictEqual(mapUnaryOperator("-"), "-");
    });

    void it("preserves unary plus operator +", () => {
        assert.strictEqual(mapUnaryOperator("+"), "+");
    });

    void it("passes through JavaScript increment operator ++", () => {
        assert.strictEqual(mapUnaryOperator("++"), "++");
    });

    void it("passes through JavaScript decrement operator --", () => {
        assert.strictEqual(mapUnaryOperator("--"), "--");
    });

    void it("passes through unknown operators unchanged", () => {
        assert.strictEqual(mapUnaryOperator("???"), "???");
        assert.strictEqual(mapUnaryOperator("custom_op"), "custom_op");
    });
});
