import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { getIdentifierText } from "../ast-node-helpers.js";

describe("getIdentifierText", () => {
    it("returns string arguments unchanged", () => {
        assert.equal(getIdentifierText("example"), "example");
    });

    it("reads the name property from plain objects", () => {
        assert.equal(getIdentifierText({ name: "identifier" }), "identifier");
    });
});
