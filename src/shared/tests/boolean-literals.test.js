import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
    getBooleanLiteralValue,
    isBooleanLiteral
} from "../ast-node-helpers.js";

describe("boolean literal helpers", () => {
    it("normalizes string literal values", () => {
        const literal = { type: "Literal", value: "TRUE" };

        assert.equal(getBooleanLiteralValue(literal), "true");
        assert.equal(isBooleanLiteral(literal), true);
    });

    it("accepts boolean literal nodes when enabled", () => {
        const literal = { type: "Literal", value: false };

        assert.equal(getBooleanLiteralValue(literal), null);
        assert.equal(isBooleanLiteral(literal), false);
        assert.equal(getBooleanLiteralValue(literal, true), "false");
        assert.equal(isBooleanLiteral(literal, true), true);
        assert.equal(
            getBooleanLiteralValue(literal, { acceptBooleanPrimitives: true }),
            "false"
        );
        assert.equal(
            isBooleanLiteral(literal, { acceptBooleanPrimitives: true }),
            true
        );
    });

    it("rejects non-boolean literals", () => {
        const numberLiteral = { type: "Literal", value: 0 };
        const identifier = { type: "Identifier", name: "value" };

        assert.equal(getBooleanLiteralValue(numberLiteral), null);
        assert.equal(isBooleanLiteral(numberLiteral), false);
        assert.equal(getBooleanLiteralValue(identifier), null);
        assert.equal(isBooleanLiteral(identifier), false);
    });
});
