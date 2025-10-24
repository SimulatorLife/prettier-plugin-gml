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

    it("treats missing comment values as empty strings", () => {
        const comment = {
            type: "CommentLine",
            value: undefined,
            raw: "//",
            leadingText: "//",
            leadingWS: "\n"
        };

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "// ");
    });

    it("normalizes Feather optional parameter sentinels", () => {
        const comment = {
            type: "CommentLine",
            value: "/// @param {real} *func_fx_callback",
            raw: "/// @param {real} *func_fx_callback",
            leadingText: "/// @param {real} *func_fx_callback",
            leadingWS: "\n"
        };

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(formatted, "/// @param {real} [func_fx_callback]");
    });

    it("retains optional parameter defaults with embedded spaces", () => {
        const comment = {
            type: "CommentLine",
            value: "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light",
            raw: "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light",
            leadingText:
                "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light",
            leadingWS: "\n"
        };

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(
            formatted,
            "/// @param {array<real>} [light_dir=[0, 0, -1]] - The direction of the light"
        );
    });
});
