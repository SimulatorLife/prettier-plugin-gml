import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    advanceStringCommentScan,
    advanceThroughComment,
    advanceThroughStringLiteral,
    createStringCommentScanState,
    tryStartStringOrComment
} from "../src/utils/text-scan.js";

void describe("string-comment scan helpers", () => {
    void it("tracks quoted strings and escapes", () => {
        const text = String.raw`"a\"b"`;
        const state = createStringCommentScanState();

        let index = tryStartStringOrComment(text, text.length, 0, state);
        assert.strictEqual(index, 1);
        assert.strictEqual(state.stringQuote, '"');

        index = advanceThroughStringLiteral(text, index, state);
        assert.strictEqual(index, 2);

        index = advanceThroughStringLiteral(text, index, state);
        assert.strictEqual(index, 3);

        index = advanceThroughStringLiteral(text, index, state);
        assert.strictEqual(index, 4);

        index = advanceThroughStringLiteral(text, index, state);
        assert.strictEqual(index, 5);

        index = advanceThroughStringLiteral(text, index, state);
        assert.strictEqual(index, 6);
        assert.strictEqual(state.stringQuote, null);
    });

    void it("advances through line comments until newline", () => {
        const text = "// hi\nx";
        const state = createStringCommentScanState();

        let index = tryStartStringOrComment(text, text.length, 0, state);
        assert.strictEqual(state.inLineComment, true);

        while (state.inLineComment && index < text.length) {
            index = advanceThroughComment(text, text.length, index, state);
        }

        assert.strictEqual(state.inLineComment, false);
        assert.strictEqual(text[index], "x");
    });

    void it("advances through block comments until closing token", () => {
        const text = "/* note */x";
        const state = createStringCommentScanState();

        let index = tryStartStringOrComment(text, text.length, 0, state);
        assert.strictEqual(state.inBlockComment, true);

        while (state.inBlockComment && index < text.length) {
            index = advanceThroughComment(text, text.length, index, state);
        }

        assert.strictEqual(state.inBlockComment, false);
        assert.strictEqual(text[index], "x");
    });

    void it("advances through @-prefixed strings when enabled", () => {
        const text = '@"hi" {';
        const state = createStringCommentScanState();

        let index = advanceStringCommentScan(text, text.length, 0, state, true);
        assert.strictEqual(index, 2);
        assert.strictEqual(state.stringQuote, '"');

        while (state.stringQuote && index < text.length) {
            index = advanceStringCommentScan(text, text.length, index, state, true);
        }

        assert.strictEqual(state.stringQuote, null);
        assert.strictEqual(text[index], " ");
    });

    void it("skips @-prefixed strings when disabled", () => {
        const text = '@"hi"';
        const state = createStringCommentScanState();

        const index = advanceStringCommentScan(text, text.length, 0, state, false);
        assert.strictEqual(index, 0);
        assert.strictEqual(state.stringQuote, null);
    });
});
