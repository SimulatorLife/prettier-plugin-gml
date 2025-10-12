import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
    DEFAULT_LINE_COMMENT_OPTIONS,
    formatLineComment,
    resolveLineCommentOptions
} from "../src/comments/index.js";

function createLineComment(value) {
    return {
        type: "CommentLine",
        value,
        leadingText: `//${value}`,
        raw: `//${value}`
    };
}

describe("lineCommentBoilerplateFragments option", () => {
    let originalLog;
    let logCalls;

    beforeEach(() => {
        originalLog = console.log;
        logCalls = [];
        console.log = (...args) => {
            logCalls.push(args.join(" "));
        };
    });

    afterEach(() => {
        console.log = originalLog;
    });

    it("preserves comments when no extra fragments are configured", () => {
        const comment = createLineComment(" Auto-generated file. Do not edit.");

        const formatted = formatLineComment(
            comment,
            DEFAULT_LINE_COMMENT_OPTIONS
        );

        assert.strictEqual(
            formatted,
            "// Auto-generated file.\n// Do not edit."
        );
        assert.deepStrictEqual(logCalls, []);
    });

    it("removes comments that match configured boilerplate fragments", () => {
        const comment = createLineComment(" Auto-generated file. Do not edit.");

        const customOptions = resolveLineCommentOptions({
            lineCommentBoilerplateFragments:
                "Auto-generated file. Do not edit."
        });

        const formatted = formatLineComment(comment, customOptions);

        assert.strictEqual(formatted, "");
        assert.ok(
            logCalls.some((message) =>
                message.includes("Removed boilerplate comment")
            )
        );
    });
});
