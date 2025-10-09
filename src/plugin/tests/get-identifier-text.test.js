import assert from "node:assert/strict";

import { describe, it } from "mocha";

import { getIdentifierText } from "../src/printer/optimizations/loop-size-hoisting.js";

describe("getIdentifierText", () => {
    it("returns string arguments unchanged", () => {
        assert.equal(getIdentifierText("example"), "example");
    });

    it("reads the name property from plain objects", () => {
        assert.equal(getIdentifierText({ name: "identifier" }), "identifier");
    });

    it("normalizes member index expressions", () => {
        const identifier = {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "list" },
            property: [
                {
                    type: "Identifier",
                    name: "count"
                }
            ]
        };

        assert.equal(getIdentifierText(identifier), "list_count");
    });
});
