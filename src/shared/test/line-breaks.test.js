import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getLineBreakCount,
    getLineBreakSpans,
    splitLines
} from "../src/utils/line-breaks.js";

describe("line-breaks", () => {
    describe("splitLines", () => {
        it("splits common newline sequences", () => {
            const text =
                "alpha\r\nbeta\ngamma\rdelta\u2028epsilon\u2029theta\u0085iota";

            assert.deepStrictEqual(splitLines(text), [
                "alpha",
                "beta",
                "gamma",
                "delta",
                "epsilon",
                "theta",
                "iota"
            ]);
        });

        it("returns a single entry for text without newlines", () => {
            const text = "single line";
            assert.deepStrictEqual(splitLines(text), [text]);
        });

        it("normalizes non-string input to an empty array", () => {
            // eslint-disable-next-line unicorn/no-useless-undefined -- explicit undefined mirrors optional metadata usage
            assert.deepStrictEqual(splitLines(undefined), []);
            assert.deepStrictEqual(splitLines(null), []);
        });

        it("mirrors String#split for empty strings", () => {
            assert.deepStrictEqual(splitLines(""), [""]);
        });
    });

    describe("getLineBreakCount", () => {
        it("counts the number of recognized break characters", () => {
            const text = "line1\r\nline2\nline3\rline4\u2028line5\u2029line6";
            assert.strictEqual(getLineBreakCount(text), 5);
        });
    });

    describe("getLineBreakSpans", () => {
        it("locates each line break sequence", () => {
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
});
