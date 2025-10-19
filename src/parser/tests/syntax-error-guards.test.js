import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSyntaxErrorWithLocation } from "../gml-parser.js";

describe("isSyntaxErrorWithLocation", () => {
    it("identifies syntax errors with location metadata", () => {
        const syntaxErrorLike = {
            message: "boom",
            line: 4,
            column: 2,
            rule: "expression",
            wrongSymbol: "token",
            offendingText: "x"
        };

        assert.equal(isSyntaxErrorWithLocation(syntaxErrorLike), true);
        assert.equal(
            isSyntaxErrorWithLocation({ message: "boom", line: "3" }),
            true
        );
        assert.equal(
            isSyntaxErrorWithLocation({ message: "boom", line: 4, rule: 5 }),
            false
        );
        assert.equal(isSyntaxErrorWithLocation({ message: "boom" }), false);
    });
});
