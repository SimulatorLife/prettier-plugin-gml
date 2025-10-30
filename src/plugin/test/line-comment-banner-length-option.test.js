import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_BANNER_LENGTH,
    printComment,
    resolveLineCommentBannerLength
} from "../src/comments/index.js";

function createBannerComment(leadingText) {
    return {
        type: "CommentLine",
        value: leadingText.slice(2),
        leadingText,
        raw: leadingText
    };
}

describe("line comment banner length option", () => {
    it("falls back to the default when the option is omitted", () => {
        assert.strictEqual(
            resolveLineCommentBannerLength(),
            DEFAULT_LINE_COMMENT_BANNER_LENGTH
        );
        assert.strictEqual(
            resolveLineCommentBannerLength({}),
            DEFAULT_LINE_COMMENT_BANNER_LENGTH
        );
    });

    it("coerces numeric and string overrides", () => {
        assert.strictEqual(
            resolveLineCommentBannerLength({ lineCommentBannerLength: 12 }),
            12
        );
        assert.strictEqual(
            resolveLineCommentBannerLength({ lineCommentBannerLength: "8" }),
            8
        );
    });

    it("treats zero as a signal to preserve the original banner length", () => {
        assert.strictEqual(
            resolveLineCommentBannerLength({ lineCommentBannerLength: 0 }),
            0
        );
    });

    it("ignores invalid overrides", () => {
        assert.strictEqual(
            resolveLineCommentBannerLength({ lineCommentBannerLength: -4 }),
            DEFAULT_LINE_COMMENT_BANNER_LENGTH
        );
        assert.strictEqual(
            resolveLineCommentBannerLength({ lineCommentBannerLength: null }),
            DEFAULT_LINE_COMMENT_BANNER_LENGTH
        );
    });

    it("normalizes banner comments to the configured width", () => {
        const comment = createBannerComment("//////// Heading");
        const printed = printComment(
            { getValue: () => comment },
            { lineCommentBannerLength: 12 }
        );

        assert.strictEqual(printed, "//////////// Heading");
    });

    it("preserves the source width when the option is disabled", () => {
        const comment = createBannerComment("//////// Heading");
        const printed = printComment(
            { getValue: () => comment },
            { lineCommentBannerLength: 0 }
        );

        assert.strictEqual(printed, "//////// Heading");
    });
});
