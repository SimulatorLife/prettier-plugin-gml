import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

function createBannerComment(leadingText) {
    return {
        type: "CommentLine",
        value: leadingText.slice(2),
        leadingText,
        raw: leadingText
    };
}

void describe("line comment banner handling", () => {
    void it("collapses banner comments into a minimal single-line comment", () => {
        const comment = createBannerComment("//////// Heading ////////");
        const printed = Parser.printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "// Heading");
    });

    void it("drops decorative banners that have no descriptive text", () => {
        const comment = createBannerComment("////////////////////////");
        const printed = Parser.printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "");
    });

    void it("preserves regular comments that do not resemble banners", () => {
        const comment = createBannerComment("// Standard comment");
        const printed = Parser.printComment({ getValue: () => comment }, {});

        assert.strictEqual(printed, "// Standard comment");
    });
});
