import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSingleMemberIndexPropertyEntry } from "../ast-node-helpers.js";

describe("getSingleMemberIndexPropertyEntry", () => {
    it("returns null for non-member index expressions", () => {
        assert.equal(getSingleMemberIndexPropertyEntry(null), null);
        assert.equal(
            getSingleMemberIndexPropertyEntry({ type: "MemberDotExpression" }),
            null
        );
    });

    it("returns null when the property array is missing or has multiple entries", () => {
        assert.equal(
            getSingleMemberIndexPropertyEntry({
                type: "MemberIndexExpression"
            }),
            null
        );

        assert.equal(
            getSingleMemberIndexPropertyEntry({
                type: "MemberIndexExpression",
                property: []
            }),
            null
        );

        assert.equal(
            getSingleMemberIndexPropertyEntry({
                type: "MemberIndexExpression",
                property: [{}, {}]
            }),
            null
        );
    });

    it("returns the sole property entry when present", () => {
        const propertyNode = { type: "Literal", value: 0 };

        assert.equal(
            getSingleMemberIndexPropertyEntry({
                type: "MemberIndexExpression",
                property: [propertyNode]
            }),
            propertyNode
        );

        assert.equal(
            getSingleMemberIndexPropertyEntry({
                type: "MemberIndexExpression",
                property: ["0"]
            }),
            "0"
        );
    });
});
