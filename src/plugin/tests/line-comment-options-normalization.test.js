import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    formatLineComment,
    resolveLineCommentOptions
} from "../src/comments/index.js";
import { isRegExpLike } from "../../shared/utils/capability-probes.js";

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
            lineCommentBoilerplateFragments: "Alpha, Beta",
            lineCommentCodeDetectionPatterns: "/^SQL:/i"
        };

        Object.freeze(pluginOptions);

        const first = resolveLineCommentOptions(pluginOptions);
        const second = resolveLineCommentOptions(pluginOptions);

        assert.strictEqual(first, second);
        assert.ok(first.boilerplateFragments.includes("Alpha"));
        assert.ok(first.boilerplateFragments.includes("Beta"));
        assert.ok(
            first.codeDetectionPatterns.some(
                (pattern) =>
                    pattern instanceof RegExp && pattern.source === "^SQL:"
            )
        );
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
            if (!isRegExpLike(pattern)) {
                return false;
            }

            if (typeof pattern.lastIndex === "number") {
                pattern.lastIndex = 0;
            }

            return pattern.test("SQL: SELECT * FROM logs");
        });

        assert.ok(
            sqlPattern,
            "Expected merged patterns to include SQL detector"
        );
    });

    it("retains RegExp-like detectors provided through options", () => {
        const probe = {
            lastIndex: 0,
            test(text) {
                this.lastIndex = 0;
                return text.startsWith("Alpha");
            },
            exec() {
                return null;
            }
        };

        const resolved = resolveLineCommentOptions({
            lineCommentCodeDetectionPatterns: probe
        });

        const match = resolved.codeDetectionPatterns.find((pattern) => {
            return pattern === probe;
        });

        assert.ok(match, "Expected to preserve RegExp-like detectors");
    });
});

describe("formatLineComment", () => {
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

    it("respects RegExp-like detection patterns when formatting", () => {
        const comment = createLineComment("AlphaBeta", "//AlphaBeta");
        const regExpLike = {
            lastIndex: 0,
            test(text) {
                this.lastIndex = 0;
                return text.startsWith("Alpha");
            },
            exec() {
                return null;
            }
        };

        const formatted = formatLineComment(comment, {
            codeDetectionPatterns: [regExpLike]
        });

        assert.equal(formatted, "//AlphaBeta");
    });
});
