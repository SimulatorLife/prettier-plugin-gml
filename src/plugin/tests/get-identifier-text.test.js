import assert from "node:assert/strict";

import { describe, it } from "mocha";

import { getIdentifierText } from "../../shared/identifier-text.js";

describe("getIdentifierText", () => {
    it("returns string arguments unchanged", () => {
        assert.equal(getIdentifierText("example"), "example");
    });

    it("reads the name property from plain objects", () => {
        assert.equal(getIdentifierText({ name: "identifier" }), "identifier");
    });

    it("derives names for member index expressions", () => {
        const memberIndex = {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "list" },
            property: [{ type: "Identifier", name: "count" }]
        };

        assert.equal(getIdentifierText(memberIndex), "list_count");
    });

    it("derives names for member dot expressions", () => {
        const memberDot = {
            type: "MemberDotExpression",
            object: { type: "Identifier", name: "instance" },
            property: { type: "Identifier", name: "field" }
        };

        assert.equal(getIdentifierText(memberDot), "instance_field");
    });

    it("returns null for incomplete member expressions", () => {
        const invalidMemberIndex = {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "array" },
            property: []
        };

        assert.equal(getIdentifierText(invalidMemberIndex), null);
    });
});
