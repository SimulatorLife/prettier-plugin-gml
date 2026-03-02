import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";

import createGameMakerParseErrorListener, { isSyntaxErrorWithLocation } from "../src/ast/gml-syntax-error.js";

void describe("GameMakerParseErrorListener", () => {
    void describe("formatRuleName", () => {
        void it("formats rule names correctly and avoids ReDoS", () => {
            const listener = createGameMakerParseErrorListener();
            const formatter = listener.formatter;

            assert.equal(formatter.formatRuleName("SimpleRule"), " simple rule");
            assert.equal(formatter.formatRuleName("XMLParser"), "xml parser");
            assert.equal(formatter.formatRuleName("MyXMLParser"), " myxml parser");
            assert.equal(formatter.formatRuleName("ruleName"), "rule name");
            assert.equal(formatter.formatRuleName("HTML"), "html");
            assert.equal(formatter.formatRuleName("XMLHttpRequest"), "xml http request");

            // ReDoS check (should be fast)
            const start = performance.now();
            const longString = `${"A".repeat(50_000)}a`;
            formatter.formatRuleName(longString);
            const end = performance.now();
            assert.ok(end - start < 100, "Regex should not be exponential");
        });
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
