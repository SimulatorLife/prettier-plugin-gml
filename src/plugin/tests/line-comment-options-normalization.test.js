import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_LINE_COMMENT_BANNER_LENGTH,
    formatLineComment,
    printComment,
    resolveLineCommentBannerLength,
    resolveLineCommentOptions
} from "../src/comments/index.js";

function createLineComment(value, raw = `//${value}`) {
    return {
        type: "CommentLine",
        value,
        leadingText: raw,
        raw
    };
}

describe("resolveLineCommentOptions", () => {
    it("always returns the default option object", () => {
        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });

    it("exposes the shared code detection patterns", () => {
        const resolved = resolveLineCommentOptions();

        assert.strictEqual(
            resolved.codeDetectionPatterns,
            DEFAULT_COMMENTED_OUT_CODE_PATTERNS
        );
    });

    it("ignores attempt to supply legacy overrides", () => {
        const resolved = resolveLineCommentOptions({
            lineCommentBoilerplateFragments: "Alpha",
            lineCommentCodeDetectionPatterns: "/^SQL:/i"
        });

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });
});

describe("resolveLineCommentBannerLength", () => {
    it("returns the default when options are missing", () => {
        const resolved = resolveLineCommentBannerLength();

        assert.equal(resolved, DEFAULT_LINE_COMMENT_BANNER_LENGTH);
    });

    it("coerces numeric overrides", () => {
        const resolved = resolveLineCommentBannerLength({
            lineCommentBannerLength: 42
        });

        assert.equal(resolved, 42);
    });

    it("coerces string overrides", () => {
        const resolved = resolveLineCommentBannerLength({
            lineCommentBannerLength: "12"
        });

        assert.equal(resolved, 12);
    });

    it("throws for negative overrides", () => {
        assert.throws(() =>
            resolveLineCommentBannerLength({
                lineCommentBannerLength: -1
            })
        );
    });

    it("throws for non-numeric overrides", () => {
        assert.throws(() =>
            resolveLineCommentBannerLength({
                lineCommentBannerLength: true
            })
        );
    });
});

describe("formatLineComment", () => {
    it("treats control-flow snippets as commented-out code using defaults", () => {
        const comment = createLineComment(
            " if (player.hp <= 0) return;",
            "// if (player.hp <= 0) return;"
        );

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.equal(formatted, "// if (player.hp <= 0) return;");
    });

    it("ignores ad-hoc override objects and still uses defaults", () => {
        const comment = createLineComment(
            " SQL: SELECT * FROM logs",
            "// SQL: SELECT * FROM logs"
        );

        const baseline = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );
        const formatted = formatLineComment(comment, {
            codeDetectionPatterns: [/^SQL:/i]
        });

        assert.equal(formatted, baseline);
    });
});

describe("printComment", () => {
    it("respects the configured banner length", () => {
        const comment = {
            type: "CommentLine",
            value: "//////// Banner",
            leadingText: "//////// Banner",
            raw: "//////// Banner"
        };

        const printed = printComment(
            {
                getValue() {
                    return comment;
                }
            },
            { lineCommentBannerLength: 10 }
        );

        assert.equal(printed, "////////// Banner");
    });
});
