import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getLineBreakCount, splitLines } from "../line-breaks.js";

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
});
