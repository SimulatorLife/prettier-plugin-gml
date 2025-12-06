import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performance } from "node:perf_hooks";
import GameMakerParseErrorListener from "../src/ast/gml-syntax-error.js";

void describe("GameMakerParseErrorListener", () => {
    void describe("formatRuleName", () => {
        void it("formats rule names correctly and avoids ReDoS", () => {
            const listener = new GameMakerParseErrorListener();
            const formatter = listener.formatter;

            assert.equal(formatter.formatRuleName("SimpleRule"), " simple rule");
            assert.equal(formatter.formatRuleName("XMLParser"), "xml parser");
            assert.equal(formatter.formatRuleName("MyXMLParser"), " myxml parser");
            assert.equal(formatter.formatRuleName("ruleName"), "rule name");
            assert.equal(formatter.formatRuleName("HTML"), "html");
            assert.equal(formatter.formatRuleName("XMLHttpRequest"), "xml http request");
            
            // ReDoS check (should be fast)
            const start = performance.now();
            const longString = "A".repeat(50000) + "a";
            formatter.formatRuleName(longString);
            const end = performance.now();
            assert.ok(end - start < 100, "Regex should not be exponential");
        });
    });
});
