import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AstPath } from "prettier";

import { findAncestorNode, safeGetParentNode } from "../src/printer/path-utils.js";

void describe("Path null safety guards", () => {
    void it("safeGetParentNode returns null when getParentNode is missing", () => {
        // Create a path object WITHOUT getParentNode method
        const pathWithoutGetParentNode = {
            getValue: () => ({ type: "ExpressionStatement" }),
            parent: null
        } as unknown as AstPath<any>;

        // Should return null instead of throwing
        const result = safeGetParentNode(pathWithoutGetParentNode);
        assert.strictEqual(result, null);
    });

    void it("safeGetParentNode uses path.parent as fallback for level 0", () => {
        const mockParent = { type: "Program", body: [] };

        const pathWithParent = {
            getValue: () => ({ type: "ExpressionStatement" }),
            parent: mockParent
            // Note: no getParentNode method
        } as unknown as AstPath<any>;

        const result = safeGetParentNode(pathWithParent);
        assert.strictEqual(result, mockParent);
    });

    void it("safeGetParentNode delegates to getParentNode when available", () => {
        const mockParent = { type: "Program", body: [] };

        const pathWithGetParentNode = {
            getValue: () => ({ type: "ExpressionStatement" }),
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
            getValue: () => ({ type: "ExpressionStatement" }),
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
            getValue: () => ({ type: "ExpressionStatement" }),
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
            getValue: () => ({ type: "Identifier" }),
            getParentNode: (level: number = 0) => ancestors[level] ?? null
        } as unknown as AstPath<any>;
    }

    void it("returns null when path is null", () => {
        assert.strictEqual(findAncestorNode(null as any, () => true), null);
    });

    void it("returns null when path lacks getParentNode", () => {
        const path = { getValue: () => ({}) } as unknown as AstPath<any>;
        assert.strictEqual(findAncestorNode(path, () => true), null);
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
