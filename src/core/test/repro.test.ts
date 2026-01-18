import assert from "node:assert";
import { describe, it } from "node:test";

import { formatLineComment } from "../src/comments/line-comment/formatting.js";

void describe("repro", () => {
    void it("formats override comment", () => {
        const comment = {
            type: "CommentLine",
            value: "/ @override",
            start: { index: 0 },
            end: { index: 12 }
        };

        const options = {
            originalText: "/// @override"
        };

        const result = formatLineComment(comment, options);
        assert.strictEqual(result, "/// @override");
    });
});
