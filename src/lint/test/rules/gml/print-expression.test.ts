import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printExpression, readNodeText } from "../../../src/rules/gml/print-expression.js";

void describe("printExpression", () => {
    void it("renders a Literal node", () => {
        const node = { type: "Literal", value: 42 };
        assert.strictEqual(printExpression(node, ""), "42");
    });

    void it("renders a string Literal node", () => {
        const node = { type: "Literal", value: '"hello"' };
        assert.strictEqual(printExpression(node, ""), '"hello"');
    });

    void it("renders an Identifier node", () => {
        const node = { type: "Identifier", name: "myVar" };
        assert.strictEqual(printExpression(node, ""), "myVar");
    });

    void it("renders a BinaryExpression node", () => {
        const node = {
            type: "BinaryExpression",
            operator: "+",
            left: { type: "Identifier", name: "a" },
            right: { type: "Literal", value: 1 }
        };
        assert.strictEqual(printExpression(node, ""), "a + 1");
    });

    void it("renders a LogicalExpression node", () => {
        const node = {
            type: "LogicalExpression",
            operator: "&&",
            left: { type: "Identifier", name: "a" },
            right: { type: "Identifier", name: "b" }
        };
        assert.strictEqual(printExpression(node, ""), "a && b");
    });

    void it("renders a UnaryExpression with prefix operator", () => {
        const node = {
            type: "UnaryExpression",
            operator: "-",
            prefix: true,
            argument: { type: "Literal", value: 5 }
        };
        assert.strictEqual(printExpression(node, ""), "-5");
    });

    void it("renders a UnaryExpression with postfix operator", () => {
        const node = {
            type: "UnaryExpression",
            operator: "++",
            prefix: false,
            argument: { type: "Identifier", name: "x" }
        };
        assert.strictEqual(printExpression(node, ""), "x++");
    });

    void it("renders a ParenthesizedExpression node", () => {
        const node = {
            type: "ParenthesizedExpression",
            expression: { type: "Identifier", name: "x" }
        };
        assert.strictEqual(printExpression(node, ""), "(x)");
    });

    void it("renders a CallExpression node with arguments", () => {
        const node = {
            type: "CallExpression",
            object: { type: "Identifier", name: "foo" },
            arguments: [
                { type: "Literal", value: 1 },
                { type: "Identifier", name: "bar" }
            ]
        };
        assert.strictEqual(printExpression(node, ""), "foo(1, bar)");
    });

    void it("renders a MemberDotExpression node", () => {
        const node = {
            type: "MemberDotExpression",
            object: { type: "Identifier", name: "obj" },
            property: { type: "Identifier", name: "prop" }
        };
        assert.strictEqual(printExpression(node, ""), "obj.prop");
    });

    void it("renders a MemberIndexExpression node", () => {
        const node = {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "arr" },
            index: { type: "Literal", value: 0 }
        };
        assert.strictEqual(printExpression(node, ""), "arr[0]");
    });

    void it("renders a ConditionalExpression node", () => {
        const node = {
            type: "ConditionalExpression",
            test: { type: "Identifier", name: "cond" },
            consequent: { type: "Literal", value: 1 },
            alternate: { type: "Literal", value: 0 }
        };
        assert.strictEqual(printExpression(node, ""), "cond ? 1 : 0");
    });

    void it("renders an AssignmentExpression node", () => {
        const node = {
            type: "AssignmentExpression",
            operator: "=",
            left: { type: "Identifier", name: "x" },
            right: { type: "Literal", value: 10 }
        };
        assert.strictEqual(printExpression(node, ""), "x = 10");
    });

    void it("falls back to readNodeText for unknown node types", () => {
        const source = "unknown_expr";
        const node = { type: "UnknownNode", start: { index: 0 }, end: { index: 6 } };
        assert.strictEqual(printExpression(node, source), "unknown");
    });

    void it("returns empty string for null input", () => {
        assert.strictEqual(printExpression(null, ""), "");
    });

    void it("returns empty string for non-object input", () => {
        assert.strictEqual(printExpression("not-an-object", ""), "");
    });
});

void describe("readNodeText", () => {
    void it("returns the source slice for a node with start/end indices", () => {
        const source = "hello world";
        const node = { type: "Identifier", start: { index: 6 }, end: { index: 10 } };
        assert.strictEqual(readNodeText(source, node), "world");
    });

    void it("returns null for a null node", () => {
        assert.strictEqual(readNodeText("source", null), null);
    });

    void it("returns null for a non-object node", () => {
        assert.strictEqual(readNodeText("source", "not-a-node"), null);
    });

    void it("returns null when location metadata is missing", () => {
        const node = { type: "Identifier", name: "x" };
        assert.strictEqual(readNodeText("source", node), null);
    });
});
