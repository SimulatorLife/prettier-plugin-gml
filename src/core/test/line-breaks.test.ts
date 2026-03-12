import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dominantLineEnding, getLineBreakCount, getLineBreakSpans, splitLines } from "../src/utils/line-breaks.js";

void describe("line-breaks", () => {
    void describe("splitLines", () => {
        void it("splits common newline sequences", () => {
            const text = "alpha\r\nbeta\ngamma\rdelta\u2028epsilon\u2029theta\u0085iota";

            assert.deepStrictEqual(splitLines(text), ["alpha", "beta", "gamma", "delta", "epsilon", "theta", "iota"]);
        });

        void it("returns a single entry for text without newlines", () => {
            const text = "single line";
            assert.deepStrictEqual(splitLines(text), [text]);
        });

        void it("normalizes non-string input to an empty array", () => {
            // explicit undefined mirrors optional metadata usage
            assert.deepStrictEqual(splitLines(undefined), []);
            assert.deepStrictEqual(splitLines(null), []);
        });

        void it("mirrors String#split for empty strings", () => {
            assert.deepStrictEqual(splitLines(""), [""]);
        });
    });

    void describe("getLineBreakCount", () => {
        void it("counts the number of recognized break characters", () => {
            const text = "line1\r\nline2\nline3\rline4\u2028line5\u2029line6";
            assert.strictEqual(getLineBreakCount(text), 5);
        });
    });

    void describe("getLineBreakSpans", () => {
        void it("locates each line break sequence", () => {
            const text = "alpha\r\nbeta\n\r\u2028gamma\u2029delta\u0085";
            assert.deepStrictEqual(getLineBreakSpans(text), [
                { index: 5, length: 2 },
                { index: 11, length: 1 },
                { index: 12, length: 1 },
                { index: 13, length: 1 },
                { index: 19, length: 1 },
                { index: 25, length: 1 }
            ]);
        });
    });

    void describe("dominantLineEnding", () => {
        void it("returns LF for a file that uses only LF line endings", () => {
            assert.strictEqual(dominantLineEnding("line1\nline2\nline3\n"), "\n");
        });

        void it("returns CRLF for a file that uses only CRLF line endings", () => {
            assert.strictEqual(dominantLineEnding("line1\r\nline2\r\nline3\r\n"), "\r\n");
        });

        void it("returns the dominant ending when CRLF is strictly more common than LF", () => {
            // 3 CRLF vs 1 bare LF → dominant is CRLF
            assert.strictEqual(dominantLineEnding("a\r\nb\r\nc\r\nd\ne"), "\r\n");
        });

        void it("returns LF when LF is strictly more common than CRLF", () => {
            // 1 CRLF vs 3 bare LF → dominant is LF
            assert.strictEqual(dominantLineEnding("a\r\nb\nc\nd\ne"), "\n");
        });

        void it("returns LF as the tie-break default when counts are equal", () => {
            // 1 CRLF vs 1 bare LF → tie, defaults to LF
            assert.strictEqual(dominantLineEnding("a\r\nb\nc"), "\n");
        });

        void it("returns LF for text with no line breaks", () => {
            assert.strictEqual(dominantLineEnding("no newlines here"), "\n");
        });
    });
});
