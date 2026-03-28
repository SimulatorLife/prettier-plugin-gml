import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getArgumentIndexFromReferenceNode } from "../../src/doc-comment/index.js";

void describe("getArgumentIndexFromReferenceNode", () => {
    void it("returns the index for argumentN identifiers", () => {
        assert.strictEqual(
            getArgumentIndexFromReferenceNode({
                type: "Identifier",
                name: "argument3"
            }),
            3
        );
    });

    void it("returns the index for bracket argument references", () => {
        assert.strictEqual(
            getArgumentIndexFromReferenceNode({
                type: "MemberIndexExpression",
                object: { type: "Identifier", name: "argument" },
                property: [{ type: "Literal", value: "2" }]
            }),
            2
        );
    });

    void it("returns the index for dot-style argument references", () => {
        assert.strictEqual(
            getArgumentIndexFromReferenceNode({
                type: "MemberExpression",
                object: { type: "Identifier", name: "argument" },
                property: { type: "Literal", value: 4 }
            }),
            4
        );
    });

    void it("returns null for non-argument references", () => {
        assert.strictEqual(
            getArgumentIndexFromReferenceNode({
                type: "Identifier",
                name: "value"
            }),
            null
        );
    });
});
