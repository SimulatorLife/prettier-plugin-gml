import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Core } from "@gml-modules/core";

const {
    resolveLineCommentOptions,
    setLineCommentOptionsResolver,
    restoreDefaultLineCommentOptionsResolver,
    DEFAULT_LINE_COMMENT_OPTIONS
} = Core;

void describe("line comment options resolver", () => {
    void it("returns defaults when no resolver is installed", () => {
        restoreDefaultLineCommentOptionsResolver();

        const first = resolveLineCommentOptions();
        const second = resolveLineCommentOptions();

        assert.deepEqual(first, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.strictEqual(first, second);
    });

    void it("uses custom resolver when one is set", () => {
        restoreDefaultLineCommentOptionsResolver();
        const sqlPattern = /^SQL:/i;

        setLineCommentOptionsResolver(() => ({
            codeDetectionPatterns: [...DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns, sqlPattern]
        }));

        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved.codeDetectionPatterns.at(-1), sqlPattern);
    });

    void it("restores the default state after clearing the resolver", () => {
        restoreDefaultLineCommentOptionsResolver();
        const sqlPattern = /^SQL:/i;

        setLineCommentOptionsResolver(() => ({
            codeDetectionPatterns: [...DEFAULT_LINE_COMMENT_OPTIONS.codeDetectionPatterns, sqlPattern]
        }));

        const customResult = resolveLineCommentOptions();
        assert.strictEqual(customResult.codeDetectionPatterns.at(-1), sqlPattern);

        const restored = restoreDefaultLineCommentOptionsResolver();
        assert.deepEqual(restored, DEFAULT_LINE_COMMENT_OPTIONS);
        assert.deepEqual(resolveLineCommentOptions(), DEFAULT_LINE_COMMENT_OPTIONS);
    });

    void it("throws when set is called with a non-function", () => {
        assert.throws(() => {
            setLineCommentOptionsResolver("not a function" as any);
        }, TypeError);
    });
});
