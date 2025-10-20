import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    LINE_COMMENT_BANNER_LENGTH_OPTION_NAME,
    LINE_COMMENT_BANNER_STANDARD_LENGTH,
    formatLineComment,
    normalizeLineCommentOptions,
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
    it("returns the default option object when overrides are absent", () => {
        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(
            resolved.bannerLength,
            LINE_COMMENT_BANNER_STANDARD_LENGTH
        );
    });

    it("memoizes computed overrides on the options bag", () => {
        const options = { [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: 48 };

        const first = resolveLineCommentOptions(options);
        const second = resolveLineCommentOptions(options);

        assert.strictEqual(first, second);
        assert.strictEqual(first.bannerLength, 48);
    });

    it("normalizes numeric banner length overrides", () => {
        const options = { [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: " 72 " };

        const resolved = resolveLineCommentOptions(options);

        assert.notStrictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(resolved.bannerLength, 72);
    });

    it("allows zero to preserve the original slash run", () => {
        const resolved = resolveLineCommentOptions({
            [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: 0
        });

        assert.notStrictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(resolved.bannerLength, 0);
    });

    it("throws when a banner override is negative", () => {
        assert.throws(() => {
            resolveLineCommentOptions({
                [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: -5
            });
        }, /gmlLineCommentBannerLength must be a non-negative integer/);
    });

    it("throws when a banner override has an invalid type", () => {
        assert.throws(() => {
            resolveLineCommentOptions({
                [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: false
            });
        }, /gmlLineCommentBannerLength must be provided as a number/);
    });

    it("ignores attempts to supply legacy overrides", () => {
        const resolved = resolveLineCommentOptions({
            lineCommentBoilerplateFragments: "Alpha",
            lineCommentCodeDetectionPatterns: "/^SQL:/i"
        });

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });
});

describe("normalizeLineCommentOptions", () => {
    it("returns defaults for ad-hoc override objects", () => {
        const normalized = normalizeLineCommentOptions({
            codeDetectionPatterns: [/^SQL:/i]
        });

        assert.strictEqual(normalized, DEFAULT_LINE_COMMENT_OPTIONS);
    });

    it("preserves resolved banner overrides", () => {
        const resolved = resolveLineCommentOptions({
            [LINE_COMMENT_BANNER_LENGTH_OPTION_NAME]: 32
        });

        const normalized = normalizeLineCommentOptions(resolved);

        assert.strictEqual(normalized, resolved);
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
