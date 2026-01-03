import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Core } from "@gml-modules/core";

type LineComment = {
    type?: "CommentLine" | "CommentBlock";
    value?: string;
    leadingText?: string;
    raw?: string;
    leadingWS?: string;
    start?: { index?: number };
    end?: { index?: number };
    _featherSuppressFollowingEmptyLine?: boolean;
};

function createLineComment(value: string, raw = `//${value}`): LineComment {
    return {
        type: "CommentLine",
        value,
        leadingText: raw,
        raw
    };
}

void describe("resolveLineCommentOptions", () => {
    afterEach(() => {
        Core.restoreDefaultLineCommentOptionsResolver();
    });

    void it("returns the default option object when no resolver is installed", () => {
        const resolved = Core.resolveLineCommentOptions();
        assert.strictEqual(resolved, Core.DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(resolved.codeDetectionPatterns, Core.DEFAULT_COMMENTED_OUT_CODE_PATTERNS);
    });

    void it("allows integrators to extend boilerplate heuristics via resolver hook", () => {
        const customFragment = "// AUTO-GENERATED FILE";
        Core.setLineCommentOptionsResolver(() => ({
            boilerplateFragments: [...Core.DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments, customFragment]
        }));
        const resolved = Core.resolveLineCommentOptions();
        assert.notStrictEqual(resolved, Core.DEFAULT_LINE_COMMENT_OPTIONS);
        assert.deepEqual(resolved.boilerplateFragments.slice(-1), [customFragment]);
        assert.strictEqual(resolved.codeDetectionPatterns, Core.DEFAULT_COMMENTED_OUT_CODE_PATTERNS);
    });

    void it("falls back to defaults when the resolver returns invalid data", () => {
        Core.setLineCommentOptionsResolver(() => ({
            boilerplateFragments: null,
            codeDetectionPatterns: ["/^SQL:/i"]
        }));
        const resolved = Core.resolveLineCommentOptions();
        assert.strictEqual(resolved, Core.DEFAULT_LINE_COMMENT_OPTIONS);
    });
});

describe("formatLineComment", () => {
    void it("treats control-flow snippets as commented-out code using defaults", () => {
        const comment = createLineComment(" if (player.hp <= 0) return;", "// if (player.hp <= 0) return;");
        const formatted = Core.formatLineComment(comment, Core.DEFAULT_LINE_COMMENT_OPTIONS);
        assert.equal(formatted, "// if (player.hp <= 0) return;");
    });

    void it("respects sanitized override objects when supplied directly", () => {
        const comment = createLineComment(" AUTO-GENERATED FILE - do not edit", "// AUTO-GENERATED FILE - do not edit");
        const formatted = Core.formatLineComment(comment, {
            boilerplateFragments: [...Core.DEFAULT_LINE_COMMENT_OPTIONS.boilerplateFragments, "AUTO-GENERATED FILE"],
            codeDetectionPatterns: Core.DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns
        });
        assert.equal(formatted, null);
    });
});
