import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGmlParseError, isSyntaxErrorWithLocation } from "../src/utils/syntax-error-guards.js";

void describe("isGmlParseError", () => {
    void it("returns true for objects with name GameMakerSyntaxError", () => {
        const parseErrorLike = { name: "GameMakerSyntaxError", message: "Unexpected token" };
        assert.equal(isGmlParseError(parseErrorLike), true);
    });

    void it("returns true for an actual Error with name overridden to GameMakerSyntaxError", () => {
        const error = new Error("Syntax error");
        error.name = "GameMakerSyntaxError";
        assert.equal(isGmlParseError(error), true);
    });

    void it("returns false for a standard Error", () => {
        assert.equal(isGmlParseError(new Error("boom")), false);
    });

    void it("returns false for a SyntaxError (name is SyntaxError, not GameMakerSyntaxError)", () => {
        assert.equal(isGmlParseError(new SyntaxError("boom")), false);
    });

    void it("returns false for null and undefined", () => {
        assert.equal(isGmlParseError(null), false);
        assert.equal(isGmlParseError(undefined), false);
    });

    void it("returns false for primitive values", () => {
        assert.equal(isGmlParseError("GameMakerSyntaxError"), false);
        assert.equal(isGmlParseError(42), false);
    });

    void it("returns false for plain objects with a different name", () => {
        assert.equal(isGmlParseError({ name: "TypeError", message: "x" }), false);
        assert.equal(isGmlParseError({ message: "x" }), false);
    });
});

void describe("isSyntaxErrorWithLocation", () => {
    void it("identifies syntax errors with location metadata", () => {
        const syntaxErrorLike = {
            message: "boom",
            line: 4,
            column: 2,
            rule: "expression",
            wrongSymbol: "token",
            offendingText: "x"
        };

        assert.equal(isSyntaxErrorWithLocation(syntaxErrorLike), true);
    });

    void it("accepts numeric strings for line/column (coercion)", () => {
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", line: "3" }), true);
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", column: "5" }), true);
    });

    void it("rejects non-numeric strings for line/column", () => {
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", line: "abc" }), false);
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", column: "xyz" }), false);
    });

    void it("rejects errors with non-string optional metadata", () => {
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", line: 4, rule: 5 }), false);
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", line: 4, wrongSymbol: 123 }), false);
        assert.equal(isSyntaxErrorWithLocation({ message: "boom", line: 4, offendingText: true }), false);
    });

    void it("rejects errors without location metadata", () => {
        assert.equal(isSyntaxErrorWithLocation({ message: "boom" }), false);
    });
});
