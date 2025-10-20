import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
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
    it("always returns the default option object", () => {
        const resolved = resolveLineCommentOptions();

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
    });

    it("ignores attempt to supply legacy overrides", () => {
        const resolved = resolveLineCommentOptions({
            lineCommentBoilerplateFragments: "Alpha",
            lineCommentCodeDetectionPatterns: "/^SQL:/i"
        });

        assert.strictEqual(resolved, DEFAULT_LINE_COMMENT_OPTIONS);
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
