import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printComment } from "../src/comments/index.js";

function createBannerComment(leadingText) {
    return {
        type: "CommentLine",
        value: leadingText.slice(2),
        leadingText,
        raw: leadingText
    };
}

describe("line comment banner handling", () => {
    it("collapses banner comments into a minimal single-line comment", () => {
        const comment = createBannerComment("//////// Heading ////////");
        const printed = printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "// Heading");
    });

    it("drops decorative banners that have no descriptive text", () => {
        const comment = createBannerComment("////////////////////////");
        const printed = printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "");
    });

    it("preserves regular comments that do not resemble banners", () => {
        const comment = createBannerComment("// Standard comment");
        const printed = printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "// Standard comment");
    });

    it("normalizes decorated banners even with two leading slashes", () => {
        const comment = createBannerComment(
            "//-------------------Move camera-----------------------//"
        );
        const printed = printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "// Move camera");
    });
});
