import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wrapConditional, wrapConditionalBody, wrapRawBody } from "../src/emitter/code-wrapping.js";
import type { GmlNode } from "../src/emitter/ast.js";

// Simple visitor that returns the node type for testing
function mockVisitor(node: GmlNode): string {
    if (node.type === "Identifier") {
        return "x";
    }
    if (node.type === "BinaryExpression") {
        return "x > 5";
    }
    if (node.type === "BlockStatement") {
        return "{\nx = 1;\n}";
    }
    if (node.type === "ParenthesizedExpression") {
        return "x";
    }
    if (node.type === "ExpressionStatement") {
        return "x = 1";
    }
    return node.type;
}

void describe("wrapConditional", () => {
    void it("wraps expression in parentheses by default", () => {
        const node = { type: "BinaryExpression" } as GmlNode;
        const result = wrapConditional(node, mockVisitor);
        assert.strictEqual(result, "(x > 5)");
    });

    void it("returns raw expression when raw=true", () => {
        const node = { type: "BinaryExpression" } as GmlNode;
        const result = wrapConditional(node, mockVisitor, true);
        assert.strictEqual(result, "x > 5");
    });

    void it("unwraps ParenthesizedExpression to avoid double-wrapping", () => {
        const node = {
            type: "ParenthesizedExpression",
            expression: { type: "Identifier" } as GmlNode
        } as GmlNode;
        const result = wrapConditional(node, mockVisitor);
        assert.strictEqual(result, "(x)");
    });

    void it("returns (undefined) for null node when raw=false", () => {
        const result = wrapConditional(null, mockVisitor);
        assert.strictEqual(result, "(undefined)");
    });

    void it("returns empty string for null node when raw=true", () => {
        const result = wrapConditional(null, mockVisitor, true);
        assert.strictEqual(result, "");
    });

    void it("returns (undefined) for undefined node when raw=false", () => {
        const result = wrapConditional(undefined, mockVisitor);
        assert.strictEqual(result, "(undefined)");
    });

    void it("returns empty string for undefined node when raw=true", () => {
        const result = wrapConditional(undefined, mockVisitor, true);
        assert.strictEqual(result, "");
    });
});

void describe("wrapConditionalBody", () => {
    void it("returns empty block for null node", () => {
        const result = wrapConditionalBody(null, mockVisitor);
        assert.strictEqual(result, " {\n}\n");
    });

    void it("returns empty block for undefined node", () => {
        const result = wrapConditionalBody(undefined, mockVisitor);
        assert.strictEqual(result, " {\n}\n");
    });

    void it("uses BlockStatement as-is with leading space", () => {
        const node = { type: "BlockStatement" } as GmlNode;
        const result = wrapConditionalBody(node, mockVisitor);
        assert.strictEqual(result, " {\nx = 1;\n}");
    });

    void it("wraps single statement in block with semicolon", () => {
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapConditionalBody(node, mockVisitor);
        assert.strictEqual(result, " {\nx = 1;\n}");
    });

    void it("does not add semicolon if statement already has one", () => {
        const visitor = () => "x = 1;";
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapConditionalBody(node, visitor);
        assert.strictEqual(result, " {\nx = 1;\n}");
    });

    void it("handles empty statement gracefully", () => {
        const visitor = () => "";
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapConditionalBody(node, visitor);
        assert.strictEqual(result, " {\n\n}");
    });

    void it("handles whitespace-only statement", () => {
        const visitor = () => "   ";
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapConditionalBody(node, visitor);
        assert.strictEqual(result, " {\n   ;\n}");
    });
});

void describe("wrapRawBody", () => {
    void it("returns raw empty block for null node", () => {
        const result = wrapRawBody(null, mockVisitor);
        assert.strictEqual(result, "{\n}\n");
    });

    void it("returns raw empty block for undefined node", () => {
        const result = wrapRawBody(undefined, mockVisitor);
        assert.strictEqual(result, "{\n}\n");
    });

    void it("uses BlockStatement as-is without leading space", () => {
        const node = { type: "BlockStatement" } as GmlNode;
        const result = wrapRawBody(node, mockVisitor);
        assert.strictEqual(result, "{\nx = 1;\n}");
    });

    void it("wraps single statement in block with semicolon and trims", () => {
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapRawBody(node, mockVisitor);
        assert.strictEqual(result, "{\nx = 1;\n}");
    });

    void it("does not add semicolon if statement already has one", () => {
        const visitor = () => "x = 1;";
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapRawBody(node, visitor);
        assert.strictEqual(result, "{\nx = 1;\n}");
    });

    void it("handles empty statement gracefully", () => {
        const visitor = () => "";
        const node = { type: "ExpressionStatement" } as GmlNode;
        const result = wrapRawBody(node, visitor);
        assert.strictEqual(result, "{\n\n}");
    });

    void it("trims leading newline from wrapped block", () => {
        const visitor = () => "return x";
        const node = { type: "ReturnStatement" } as GmlNode;
        const result = wrapRawBody(node, visitor);
        // The \n at the start should be trimmed
        assert.ok(!result.startsWith("\n{"));
        assert.ok(result.startsWith("{"));
    });
});
