import { test } from "node:test";
import assert from "node:assert/strict";

import { print as printNode } from "../src/printer/print.js";

test("call expressions guard missing parent nodes in lvalue chain detection", () => {
    const callNode = {
        type: "CallExpression",
        object: { type: "Identifier", name: "demo" },
        arguments: [],
        comments: undefined
    };

    const stubPath = {
        node: callNode,
        parent: null,
        getValue() {
            return callNode;
        },
        getParentNode() {
            return this.parent;
        }
    };

    const doc = printNode(stubPath, {}, (property) => {
        assert.equal(property, "object");
        return "demo";
    });

    assert.equal(typeof doc, "object");
    assert.equal(doc.type, "group");
});
