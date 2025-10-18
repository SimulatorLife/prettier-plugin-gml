import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
    getCallExpressionIdentifier,
    getCallExpressionIdentifierName
} from "../ast-node-helpers.js";

describe("getCallExpressionIdentifier", () => {
    it("returns the identifier node when the callee is a named identifier", () => {
        const identifier = { type: "Identifier", name: "example" };
        const callExpression = {
            type: "CallExpression",
            object: identifier,
            arguments: []
        };

        assert.equal(getCallExpressionIdentifier(callExpression), identifier);
    });

    it("returns null when the callee is not an identifier", () => {
        const callExpression = {
            type: "CallExpression",
            object: { type: "MemberDotExpression" },
            arguments: []
        };

        assert.equal(getCallExpressionIdentifier(callExpression), null);
    });

    it("returns null when the identifier name is not a string", () => {
        const callExpression = {
            type: "CallExpression",
            object: { type: "Identifier", name: 42 },
            arguments: []
        };

        assert.equal(getCallExpressionIdentifier(callExpression), null);
    });
});

describe("getCallExpressionIdentifierName", () => {
    it("returns the callee name when available", () => {
        const callExpression = {
            type: "CallExpression",
            object: { type: "Identifier", name: "do_work" },
            arguments: []
        };

        assert.equal(getCallExpressionIdentifierName(callExpression), "do_work");
    });

    it("returns null for non-call expressions", () => {
        assert.equal(getCallExpressionIdentifierName({ type: "Identifier" }), null);
    });

    it("returns null when the callee lacks a string name", () => {
        const callExpression = {
            type: "CallExpression",
            object: { type: "Identifier", name: null },
            arguments: []
        };

        assert.equal(getCallExpressionIdentifierName(callExpression), null);
    });
});
