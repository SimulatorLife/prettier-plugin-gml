import assert from "node:assert/strict";
import test from "node:test";

import {
    cloneAstNodeWithoutTraversalLinks,
    findFirstAstNodeBy,
    walkAstNodes
} from "../../src/rules/gml/rule-base-helpers.js";
import { assertEquals } from "../assertions.js";

void test("findFirstAstNodeBy returns the first matching node in source order", () => {
    const astRoot = {
        type: "Program",
        body: [
            { type: "Identifier", name: "first" },
            { type: "Identifier", name: "second" }
        ]
    };

    const matchedNode = findFirstAstNodeBy(astRoot, (node) => node.type === "Identifier");

    assert.ok(matchedNode);
    assertEquals(matchedNode.name, "first");
});

void test("findFirstAstNodeBy ignores parent cycles and returns null when unmatched", () => {
    const identifierNode: { type: string; name: string; parent?: unknown } = {
        type: "Identifier",
        name: "stable"
    };
    const astRoot = {
        type: "Program",
        body: [identifierNode]
    };
    identifierNode.parent = astRoot;

    const matchedNode = findFirstAstNodeBy(astRoot, (node) => node.type === "BinaryExpression");

    assertEquals(matchedNode, null);
});

void test("walkAstNodes preserves source order when traversing array children", () => {
    const astRoot = {
        type: "Program",
        body: [
            { type: "Identifier", name: "alpha" },
            { type: "Identifier", name: "beta" },
            { type: "Identifier", name: "gamma" }
        ]
    };

    const visitedIdentifiers: string[] = [];
    walkAstNodes(astRoot, (node) => {
        if (typeof node.name === "string") {
            visitedIdentifiers.push(node.name);
        }
    });

    assert.deepEqual(visitedIdentifiers, ["alpha", "beta", "gamma"]);
});

void test("cloneAstNodeWithoutTraversalLinks keeps local parent links without cloning ancestors", () => {
    const identifierNode: { type: string; name: string; parent?: unknown } = {
        type: "Identifier",
        name: "value"
    };
    const astRoot = {
        type: "Program",
        body: [identifierNode]
    };
    const externalParent = {
        type: "FunctionDeclaration",
        body: [astRoot]
    };
    identifierNode.parent = astRoot;
    (astRoot as { parent?: unknown }).parent = externalParent;

    const clonedRoot = cloneAstNodeWithoutTraversalLinks(astRoot);
    const clonedIdentifier = (clonedRoot.body as Array<Record<string, unknown>>)[0];

    assert.equal("parent" in clonedRoot, false);
    assert.ok(clonedIdentifier);
    assert.equal(clonedIdentifier.parent, clonedRoot);
});

void test("cloneAstNodeWithoutTraversalLinks preserves nested node values", () => {
    const astRoot = {
        type: "AssignmentExpression",
        operator: "=",
        left: { type: "Identifier", name: "target" },
        right: { type: "Literal", value: "42" }
    };

    const clonedRoot = cloneAstNodeWithoutTraversalLinks(astRoot);
    const clonedLeft = clonedRoot.left as Record<string, unknown>;
    const clonedRight = clonedRoot.right as Record<string, unknown>;

    assert.notEqual(clonedRoot, astRoot);
    assert.equal(clonedRoot.type, "AssignmentExpression");
    assert.equal(clonedRoot.operator, "=");
    assert.equal(clonedLeft.type, "Identifier");
    assert.equal(clonedLeft.name, "target");
    assert.equal(clonedRight.type, "Literal");
    assert.equal(clonedRight.value, "42");
    assert.equal(clonedLeft.parent, clonedRoot);
    assert.equal(clonedRight.parent, clonedRoot);
});
