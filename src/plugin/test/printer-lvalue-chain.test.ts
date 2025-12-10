import { test } from "node:test";
import assert from "node:assert/strict";

import * as Printer from "../src/printer/index.js";

void test("call expressions guard missing parent nodes in lvalue chain detection", () => {
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

    const doc = Printer.print(stubPath, {}, (property) => {
        assert.equal(property, "object");
        return "demo";
    });

    assert.equal(typeof doc, "object");
    assert.equal(doc.type, "group");
});
