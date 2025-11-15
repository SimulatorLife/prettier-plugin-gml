import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
    isUndefinedLiteral,
    isUndefinedSentinel
} from "../src/ast/node-helpers.js";

describe("undefined literal helper", () => {
    it("matches string literal values case-insensitively", () => {
        const literal = { type: "Literal", value: "UNDEFINED" };

        assert.equal(isUndefinedLiteral(literal), true);
    });

    it("rejects non-matching literal values", () => {
        const literal = { type: "Literal", value: "null" };

        assert.equal(isUndefinedLiteral(literal), false);
    });

    it("rejects non-literal nodes", () => {
        const identifier = { type: "Identifier", name: "undefined" };

        assert.equal(isUndefinedLiteral(identifier), false);
        assert.equal(isUndefinedLiteral(null), false);
    });
});

describe("undefined sentinel helper", () => {
    it("matches literal nodes with undefined values", () => {
        const literal = { type: "Literal", value: undefined };

        assert.equal(isUndefinedSentinel(literal), true);
    });

    it("matches identifier nodes case-insensitively", () => {
        const identifier = { type: "Identifier", name: "UNDEFINED" };

        assert.equal(isUndefinedSentinel(identifier), true);
    });

    it("rejects unrelated nodes", () => {
        const literal = { type: "Literal", value: "null" };

        assert.equal(isUndefinedSentinel(literal), false);
        assert.equal(isUndefinedSentinel(null), false);
    });
});
