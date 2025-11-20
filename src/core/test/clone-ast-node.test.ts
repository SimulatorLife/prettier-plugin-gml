import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cloneAstNode } from "../src/ast/node-helpers.js";

describe("cloneAstNode", () => {
    it("returns null for nullish values", () => {
        assert.equal(cloneAstNode(null), null);
        assert.equal(cloneAstNode(), null);
    });

    it("returns primitives unchanged", () => {
        const text = "identifier";
        const count = 42;

        assert.equal(cloneAstNode(text), text);
        assert.equal(cloneAstNode(count), count);
    });

    it("clones objects without sharing references", () => {
        const original = {
            type: "Literal",
            value: "foo",
            nested: { value: "bar" }
        };

        const cloned = cloneAstNode(original);

        assert.notEqual(cloned, original);
        assert.deepEqual(cloned, original);

        cloned.nested.value = "baz";
        assert.equal(original.nested.value, "bar");
    });
});
