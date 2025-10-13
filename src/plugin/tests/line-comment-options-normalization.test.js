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
});
