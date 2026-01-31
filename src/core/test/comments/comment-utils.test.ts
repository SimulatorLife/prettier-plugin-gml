import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Core } from "../../src/index.js";

void describe("suppressTrailingLineComment", () => {
    void it("removes matching line comments from the owner comment list", () => {
        const node = {
            comments: [
                { type: "CommentLine", value: "keep", start: { line: 2 } },
                { type: "CommentLine", value: "remove", loc: { start: { line: 3 } } },
                { type: "CommentBlock", value: "retain", start: { line: 3 } }
            ]
        };

        Core.suppressTrailingLineComment(node, 3);

        assert.equal(node.comments.length, 2);
        assert.equal(node.comments[0]?.value, "keep");
        assert.equal(node.comments[1]?.type, "CommentBlock");
    });

    void it("falls back to the root when the owner has no comments", () => {
        const owner = {};
        const root = {
            comments: [{ type: "CommentLine", value: "root", start: { line: 7 } }]
        };

        Core.suppressTrailingLineComment(owner, 7, root);

        assert.equal(root.comments.length, 0);
    });
});
