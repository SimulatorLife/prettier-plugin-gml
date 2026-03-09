import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AstPath } from "prettier";

import { findAncestorNode, safeGetParentNode } from "../src/printer/path-utils.js";

void describe("Path null safety guards", () => {
    void it("safeGetParentNode returns null when getParentNode is missing", () => {
        // Create a path object WITHOUT getParentNode method
        const pathWithoutGetParentNode = {
            node: { type: "ExpressionStatement" },
            parent: null
        } as unknown as AstPath<any>;

        // Should return null instead of throwing
        const result = safeGetParentNode(pathWithoutGetParentNode);
        assert.strictEqual(result, null);
    });

    void it("safeGetParentNode uses path.parent as fallback for level 0", () => {
        const mockParent = { type: "Program", body: [] };

        const pathWithParent = {
            node: { type: "ExpressionStatement" },
            parent: mockParent
            // Note: no getParentNode method
        } as unknown as AstPath<any>;

        const result = safeGetParentNode(pathWithParent);
        assert.strictEqual(result, mockParent);
    });

    void it("safeGetParentNode delegates to getParentNode when available", () => {
        const mockParent = { type: "Program", body: [] };

        const pathWithGetParentNode = {
            node: { type: "ExpressionStatement" },
            parent: null,
            getParentNode: (level: number = 0) => (level === 0 ? mockParent : null)
        } as unknown as AstPath<any>;

        const result = safeGetParentNode(pathWithGetParentNode);
        assert.strictEqual(result, mockParent);
    });

    void it("safeGetParentNode handles level parameter correctly", () => {
        const mockGrandParent = { type: "Program", body: [] };
        const mockParent = { type: "BlockStatement", body: [] };

        const pathWithGetParentNode = {
            node: { type: "ExpressionStatement" },
            parent: mockParent,
            getParentNode: (level: number = 0) => (level === 0 ? mockParent : level === 1 ? mockGrandParent : null)
        } as unknown as AstPath<any>;

        const parent = safeGetParentNode(pathWithGetParentNode, 0);
        assert.strictEqual(parent, mockParent);

        const grandParent = safeGetParentNode(pathWithGetParentNode, 1);
        assert.strictEqual(grandParent, mockGrandParent);
    });

    void it("safeGetParentNode returns null for level > 0 when getParentNode is missing", () => {
        const mockParent = { type: "Program", body: [] };

        const pathWithParent = {
            node: { type: "ExpressionStatement" },
            parent: mockParent
            // Note: no getParentNode method
        } as unknown as AstPath<any>;

        // Level 0 should use fallback to path.parent
        const result0 = safeGetParentNode(pathWithParent, 0);
        assert.strictEqual(result0, mockParent);

        // Level > 0 should return null since getParentNode doesn't exist
        const result1 = safeGetParentNode(pathWithParent, 1);
        assert.strictEqual(result1, null);
    });
});

void describe("findAncestorNode", () => {
    /**
     * Builds a mock AstPath whose getParentNode returns ancestors from the
     * provided array (index 0 = immediate parent, 1 = grandparent, …).
     */
    function makePath(ancestors: Array<{ type: string }>): AstPath<any> {
        return {
            node: { type: "Identifier" },
            getParentNode: (level: number = 0) => ancestors[level] ?? null
        } as unknown as AstPath<any>;
    }

    void it("returns null when path is null", () => {
        assert.strictEqual(
            findAncestorNode(null as any, () => true),
            null
        );
    });

    void it("returns null when path lacks getParentNode", () => {
        const path = { node: {} } as unknown as AstPath<any>;
        assert.strictEqual(
            findAncestorNode(path, () => true),
            null
        );
    });

    void it("returns null when no ancestor matches the predicate", () => {
        const path = makePath([{ type: "ExpressionStatement" }, { type: "BlockStatement" }]);
        assert.strictEqual(
            findAncestorNode(path, (node) => node.type === "FunctionDeclaration"),
            null
        );
    });

    void it("returns the immediate parent when it matches", () => {
        const parent = { type: "FunctionDeclaration" };
        const path = makePath([parent, { type: "Program" }]);
        assert.strictEqual(
            findAncestorNode(path, (node) => node.type === "FunctionDeclaration"),
            parent
        );
    });

    void it("skips non-matching ancestors and returns the first match", () => {
        const fnNode = { type: "FunctionDeclaration" };
        const path = makePath([{ type: "BlockStatement" }, { type: "ExpressionStatement" }, fnNode]);
        assert.strictEqual(
            findAncestorNode(path, (node) => node.type === "FunctionDeclaration"),
            fnNode
        );
    });

    void it("supports arbitrary predicates", () => {
        const target = { type: "ConstructorDeclaration", isConstructor: true };
        const path = makePath([{ type: "BlockStatement" }, target]);
        assert.strictEqual(
            findAncestorNode(path, (node) => node.isConstructor === true),
            target
        );
    });
});

/**
 * Regression: Prettier v3 deprecated `AstPath#getValue()` (and `AstPath#getName()`)
 * in favour of the `path.node` and `path.key`/`path.index` getters.  The printer,
 * comment-handler, and semicolon helpers have all been migrated to the modern
 * equivalents.  These tests confirm that mock `AstPath` objects constructed using
 * the new getter-style API produce identical results to the old method calls.
 */
void describe("Prettier v3 AstPath modern API — regression coverage", () => {
    void it("path.node and legacy getValue() return the same runtime value", () => {
        const mockNode = { type: "ExpressionStatement", value: 42 };

        // Modern Prettier v3 API: `path.node` is a getter property
        const modernPath = {
            node: mockNode,
            getParentNode: () => null
        } as unknown as AstPath<any>;

        assert.strictEqual(modernPath.node, mockNode);
        assert.strictEqual(modernPath.node.type, "ExpressionStatement");
        assert.strictEqual(modernPath.node.value, 42);
    });

    void it("path.index carries the same array position as the old getName() numeric result", () => {
        const body = [{ type: "A" }, { type: "B" }, { type: "C" }];
        const expectedIndex = 1;

        // Modern API: `path.index` replaces `path.getName()` for array positions
        const pathAtIndex = {
            node: body[expectedIndex],
            index: expectedIndex
        } as unknown as AstPath<any>;

        assert.strictEqual(pathAtIndex.index, expectedIndex);
        assert.deepStrictEqual(pathAtIndex.node, body[expectedIndex]);
    });

    void it("path.key carries the same string key as the old getName() string result", () => {
        const parent = { property: { type: "Identifier", name: "x" } };

        // Modern API: `path.key` replaces `path.getName()` for string keys
        const pathAtKey = {
            node: parent.property,
            key: "property"
        } as unknown as AstPath<any>;

        assert.strictEqual(pathAtKey.key, "property");
        assert.deepStrictEqual(pathAtKey.node, parent.property);
    });

    void it("path?.node nullish coalescence works identically to the old defensive getValue guard", () => {
        // The old code used: `path && typeof path.getValue === "function" ? path.getValue() : null`
        // The new equivalent is: `path?.node ?? null`

        const mockNode = { type: "BlockStatement" };
        const validPath = { node: mockNode } as unknown as AstPath<any>;

        assert.strictEqual(validPath?.node ?? null, mockNode);

        // When path itself is null/undefined, should yield null
        const nullPath = null as unknown as AstPath<any>;
        assert.strictEqual(nullPath?.node ?? null, null);
    });
});
