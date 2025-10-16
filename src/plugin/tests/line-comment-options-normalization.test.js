import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    formatLineComment,
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
    it("caches resolved objects for repeated plugin option lookups", () => {
        const pluginOptions = {
            lineCommentBannerMinimumSlashes: 7,
            lineCommentBannerAutofillThreshold: 3,
            lineCommentBoilerplateFragments: "Alpha, Beta"
        };

        const first = resolveLineCommentOptions(pluginOptions);
        const second = resolveLineCommentOptions(pluginOptions);

        assert.strictEqual(first, second);
        assert.equal(first.bannerMinimum, 7);
        assert.equal(first.bannerAutofillThreshold, 3);
        assert.ok(first.boilerplateFragments.includes("Alpha"));
        assert.ok(first.boilerplateFragments.includes("Beta"));
    });

    it("falls back to defaults when no overrides are provided", () => {
        const resolved = resolveLineCommentOptions({});

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });

    it("merges custom code detection patterns from plugin options", () => {
        const resolved = resolveLineCommentOptions({
            lineCommentCodeDetectionPatterns: "/^SQL:/i"
        });

        assert.notStrictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.equal(
            resolved.codeDetectionPatterns.length,
            DEFAULT_COMMENTED_OUT_CODE_PATTERNS.length + 1
        );

        const sqlPattern = resolved.codeDetectionPatterns.find((pattern) => {
            if (!(pattern instanceof RegExp)) {
                return false;
            }

            pattern.lastIndex = 0;
            return pattern.test("SQL: SELECT * FROM logs");
        });

        assert.ok(
            sqlPattern,
            "Expected merged patterns to include SQL detector"
        );
    });
});

describe("formatLineComment", () => {
    it("applies banner overrides passed directly to the formatter", () => {
        const comment = createLineComment(" Banner", "/// Banner");

        const formatted = formatLineComment(comment, { bannerMinimum: 3 });
        assert.equal(formatted, "/// Banner");
    });

    it("accepts numeric banner overrides", () => {
        const comment = createLineComment(" Banner", "/// Banner");

        const formatted = formatLineComment(comment, 3);
        assert.equal(formatted, "/// Banner");
    });

    it("dedupes custom boilerplate fragments while normalizing options", () => {
        const comment = createLineComment(
            " Auto-generated file. Do not edit.",
            "// Auto-generated file. Do not edit."
        );

        const formatted = formatLineComment(comment, {
            boilerplateFragments: [
                "Auto-generated file. Do not edit.",
                "Auto-generated file. Do not edit.",
                ""
            ]
        });

        assert.equal(formatted, "");
    });

    it("respects custom code detection patterns when formatting", () => {
        const comment = createLineComment(
            "SQL: SELECT * FROM logs",
            "//SQL: SELECT * FROM logs"
        );

        const formatted = formatLineComment(comment, {
            codeDetectionPatterns: [/^SQL:/i]
        });

        assert.equal(formatted, "//SQL: SELECT * FROM logs");
    });

    it("keeps trailing comments on a single line without crashing", () => {
        const comment = {
            type: "CommentLine",
            value: " trailing comment text  ",
            raw: "// trailing comment text  ",
            leadingText: "// trailing comment text  ",
            leadingWS: "  ",
            leadingChar: ")"
        };

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.equal(formatted, "// trailing comment text");
        assert.equal(formatted.includes("\n"), false);
    });
});
