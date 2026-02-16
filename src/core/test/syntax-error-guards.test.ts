import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSyntaxErrorWithLocation } from "../src/utils/syntax-error-guards.js";

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
