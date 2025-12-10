import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Core } from "../../src/index.js";

const {
    DEFAULT_COMMENTED_OUT_CODE_PATTERNS,
    DEFAULT_LINE_COMMENT_OPTIONS,
    formatLineComment,
    resolveLineCommentOptions,
    restoreDefaultLineCommentOptionsResolver,
    setLineCommentOptionsResolver
} = Core;

function createLineComment(value, raw = `//${value}`) {
    return {
        type: "CommentLine",
        value,
        leadingText: raw,
        raw
    };
}

void describe("resolveLineCommentOptions", () => {
    afterEach(() => {
        restoreDefaultLineCommentOptionsResolver();
    });

    void it("returns the default option object when no resolver is installed", () => {
        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(
            resolved.codeDetectionPatterns,
            DEFAULT_COMMENTED_OUT_CODE_PATTERNS
        );
    });

    void it("allows integrators to extend boilerplate heuristics via resolver hook", () => {
        const customFragment = "// AUTO-GENERATED FILE";
        setLineCommentOptionsResolver(() => ({
            boilerplateFragments: [
                ...DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments,
                customFragment
            ]
        }));

        const resolved = resolveLineCommentOptions();

        assert.notStrictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.deepEqual(resolved.boilerplateFragments.slice(-1), [
            customFragment
        ]);
        assert.strictEqual(
            resolved.codeDetectionPatterns,
            DEFAULT_COMMENTED_OUT_CODE_PATTERNS
        );
    });

    void it("falls back to defaults when the resolver returns invalid data", () => {
        setLineCommentOptionsResolver(() => ({
            boilerplateFragments: null,
            codeDetectionPatterns: ["/^SQL:/i"]
        }));

        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });
});

void describe("formatLineComment", () => {
    void it("treats control-flow snippets as commented-out code using defaults", () => {
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

    void it("respects sanitized override objects when supplied directly", () => {
        const comment = createLineComment(
            " AUTO-GENERATED FILE - do not edit",
            "// AUTO-GENERATED FILE - do not edit"
        );

        const formatted = formatLineComment(comment, {
            boilerplateFragments: [
                ...DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments,
                "AUTO-GENERATED FILE"
            ],
            codeDetectionPatterns:
                DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns
        });

        assert.equal(formatted, "");
    });
});
