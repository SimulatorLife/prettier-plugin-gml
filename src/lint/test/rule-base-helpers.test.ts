import assert from "node:assert/strict";
import test from "node:test";

import type { Rule } from "eslint";

import { findFirstAstNodeBy, resolveLocFromIndex, walkAstNodes } from "../src/rules/gml/rule-base-helpers.js";

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
    assert.equal(matchedNode.name, "first");
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

    assert.equal(matchedNode, null);
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

function makeContext(
    sourceText: string,
    getLocFromIndex?: (index: number) => { line: number; column: number } | undefined
): Rule.RuleContext {
    const sourceCode = getLocFromIndex
        ? Object.assign(Object.create(null), { text: sourceText, getLocFromIndex })
        : Object.assign(Object.create(null), { text: sourceText });
    return { sourceCode } as unknown as Rule.RuleContext;
}

void test("resolveLocFromIndex returns line 1 column 0 for empty source", () => {
    const context = makeContext("");
    const result = resolveLocFromIndex(context, 0);
    assert.deepEqual(result, { line: 1, column: 0 });
});

void test("resolveLocFromIndex returns correct column on first line", () => {
    const context = makeContext("var x = 1;");
    assert.deepEqual(resolveLocFromIndex(context, 4), { line: 1, column: 4 });
});

void test("resolveLocFromIndex advances line after newline character", () => {
    const context = makeContext("foo\nbar");
    assert.deepEqual(resolveLocFromIndex(context, 4), { line: 2, column: 0 });
    assert.deepEqual(resolveLocFromIndex(context, 6), { line: 2, column: 2 });
});

void test("resolveLocFromIndex clamps negative index to zero", () => {
    const context = makeContext("hello");
    assert.deepEqual(resolveLocFromIndex(context, -5), { line: 1, column: 0 });
});

void test("resolveLocFromIndex clamps out-of-bounds index to source length", () => {
    const context = makeContext("hi");
    assert.deepEqual(resolveLocFromIndex(context, 999), { line: 1, column: 2 });
});

void test("resolveLocFromIndex uses getLocFromIndex API when available and valid", () => {
    const sentinel = { line: 7, column: 3 };
    const context = makeContext("foo\nbar\nbaz", () => sentinel);
    assert.deepEqual(resolveLocFromIndex(context, 4), sentinel);
});

void test("resolveLocFromIndex falls back to manual scan when getLocFromIndex returns non-finite value", () => {
    const context = makeContext("foo\nbar", () => ({ line: NaN, column: 0 }));
    assert.deepEqual(resolveLocFromIndex(context, 4), { line: 2, column: 0 });
});

void test("resolveLocFromIndex falls back to manual scan when getLocFromIndex is absent", () => {
    const context = makeContext("line1\nline2\nline3");
    assert.deepEqual(resolveLocFromIndex(context, 12), { line: 3, column: 0 });
});
