import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    formatLineComment
} from "../src/comments/index.js";

function createIndentedComment(value) {
    return {
        type: "CommentLine",
        value,
        leadingText: `//${value}`,
        raw: `//${value}`,
        leadingWS: "\n    "
    };
}

describe("line comment formatting", () => {
    it("preserves indentation when splitting multi-sentence comments", () => {
        const comment = createIndentedComment(
            " First sentence. Second sentence."
        );

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(
            formatted,
            ["// First sentence.", "    // Second sentence."].join("\n")
        );
    });
});
