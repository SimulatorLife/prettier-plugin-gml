import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Core } from "../index.js";

void describe("Core.isLoopLikeNode", () => {
    void it("returns true for ForStatement nodes", () => {
        assert.ok(Core.isLoopLikeNode({ type: "ForStatement" }));
    });

    void it("returns true for WhileStatement nodes", () => {
        assert.ok(Core.isLoopLikeNode({ type: "WhileStatement" }));
    });

    void it("returns true for DoUntilStatement nodes", () => {
        assert.ok(Core.isLoopLikeNode({ type: "DoUntilStatement" }));
    });

    void it("returns true for RepeatStatement nodes", () => {
        assert.ok(Core.isLoopLikeNode({ type: "RepeatStatement" }));
    });

    void it("returns false for WithStatement nodes", () => {
        // WithStatement is intentionally excluded: its scope-change semantics
        // differ from pure loops and make it unsuitable for generic loop optimisations.
        assert.equal(Core.isLoopLikeNode({ type: "WithStatement" }), false);
    });

    void it("returns false for IfStatement nodes", () => {
        assert.equal(Core.isLoopLikeNode({ type: "IfStatement" }), false);
    });

    void it("returns false for BlockStatement nodes", () => {
        assert.equal(Core.isLoopLikeNode({ type: "BlockStatement" }), false);
    });

    void it("returns false for expression nodes", () => {
        assert.equal(Core.isLoopLikeNode({ type: "BinaryExpression" }), false);
        assert.equal(Core.isLoopLikeNode({ type: "CallExpression" }), false);
    });

    void it("returns false for null and undefined", () => {
        assert.equal(Core.isLoopLikeNode(null), false);
        assert.equal(Core.isLoopLikeNode(undefined), false);
    });

    void it("returns false for primitives", () => {
        assert.equal(Core.isLoopLikeNode(42), false);
        assert.equal(Core.isLoopLikeNode("ForStatement"), false);
        assert.equal(Core.isLoopLikeNode(true), false);
    });

    void it("returns false for objects without a type", () => {
        assert.equal(Core.isLoopLikeNode({}), false);
        assert.equal(Core.isLoopLikeNode({ body: {} }), false);
    });

    void it("returns false for objects with a non-string type", () => {
        assert.equal(Core.isLoopLikeNode({ type: null }), false);
        assert.equal(Core.isLoopLikeNode({ type: 42 }), false);
    });
});
