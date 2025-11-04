import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE,
    DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE,
    resolveDocCommentMinSentenceBreakSpace
} from "../src/options/doc-comment-sentence-break-options.js";

describe("doc comment sentence break option", () => {
    it("falls back to the default when the option is omitted", () => {
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace(),
            DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE
        );
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({}),
            DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE
        );
    });

    it("coerces numeric and string overrides", () => {
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: 80
            }),
            80
        );
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: "40"
            }),
            40
        );
    });

    it("treats zero as a signal to disable sentence breaking", () => {
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: 0
            }),
            DOC_COMMENT_SENTENCE_BREAK_DISABLED_VALUE
        );
    });

    it("ignores invalid overrides", () => {
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: -4
            }),
            DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE
        );
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: null
            }),
            DEFAULT_DOC_COMMENT_MIN_SENTENCE_BREAK_SPACE
        );
    });

    it("accepts custom threshold values", () => {
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: 100
            }),
            100
        );
        assert.strictEqual(
            resolveDocCommentMinSentenceBreakSpace({
                docCommentMinSentenceBreakSpace: 20
            }),
            20
        );
    });
});
