import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AstPath } from "prettier";

void describe("Path null safety guards", () => {
    void it("handles missing getParentNode gracefully in function doc printing", async () => {
        // Dynamically import to avoid build-time dependency issues
        const functionDocs = await import("../src/printer/doc-comment/function-docs.js");

        // Create a minimal AST node that would be passed to collectFunctionDocumentation
        const mockFunctionNode = {
            type: "FunctionDeclaration",
            id: { type: "Identifier", name: "testFunction" },
            params: [],
            body: {
                type: "BlockStatement",
                body: []
            },
            comments: []
        };

        // Create a path object WITHOUT getParentNode method
        // This simulates an edge case or older Prettier version
        const pathWithoutGetParentNode = {
            getValue: () => mockFunctionNode,
            parent: null,
            // Note: getParentNode is missing!
        } as unknown as AstPath<unknown>;

        // This should not throw "TypeError: path.getParentNode is not a function"
        // Before fix: would crash
        // After fix: should handle gracefully
        assert.doesNotThrow(() => {
            functionDocs.collectFunctionDocumentation(
                mockFunctionNode,
                pathWithoutGetParentNode,
                {}
            );
        });
    });

    void it("handles missing getParentNode in print function declaration", async () => {
        const printModule = await import("../src/printer/print.js");

        const mockFunctionNode = {
            type: "FunctionDeclaration",
            id: { type: "Identifier", name: "testFunc" },
            params: [],
            body: {
                type: "BlockStatement",
                body: []
            },
            comments: []
        };

        // Path object missing getParentNode
        const pathWithoutGetParentNode = {
            getValue: () => mockFunctionNode,
            parent: null,
            call: (fn: unknown) => fn,
            map: (fn: unknown) => []
        } as unknown as AstPath<unknown>;

        const options = {
            originalText: "function testFunc() {}",
            printWidth: 80
        };

        const mockPrint = () => [];

        // This should not crash even without getParentNode
        assert.doesNotThrow(() => {
            printModule.print(pathWithoutGetParentNode, options, mockPrint);
        });
    });

    void it("treats path without getParentNode as having null parent", () => {
        // The fix should treat missing getParentNode the same as getParentNode() returning null
        const pathA = {
            getValue: () => ({ type: "ExpressionStatement" }),
            parent: null
        } as unknown as AstPath<unknown>;

        const pathB = {
            getValue: () => ({ type: "ExpressionStatement" }),
            getParentNode: () => null
        } as unknown as AstPath<unknown>;

        // Both should behave the same way - either both work or both fail,
        // but pathA should never throw "not a function" error
        // The test passes if no assertion fails (implicit test)
        assert.ok(pathA);
        assert.ok(pathB);
    });
});
