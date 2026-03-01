import assert from "node:assert/strict";
import test from "node:test";

import { findFirstAstNodeBy, resolveRuleReportLocation, walkAstNodes } from "../../src/rules/gml/rule-base-helpers.js";

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

// ============================================================================
// resolveRuleReportLocation
// ============================================================================

function makeRuleContext(sourceText: string, getLocFromIndex?: (index: number) => { line: number; column: number }) {
    return {
        sourceCode: {
            text: sourceText,
            ...(getLocFromIndex ? { getLocFromIndex } : {})
        }
    };
}

void test("resolveRuleReportLocation returns {line:1,column:0} for index 0", () => {
    const context = makeRuleContext("x = 1;");
    const loc = resolveRuleReportLocation(context as any, 0);
    assert.deepEqual(loc, { line: 1, column: 0 });
});

void test("resolveRuleReportLocation falls back to manual scan when getLocFromIndex is absent", () => {
    const source = "line1\nline2\nline3";
    const context = makeRuleContext(source);
    // offset 6 is the 'l' in "line2"
    const loc = resolveRuleReportLocation(context as any, 6);
    assert.deepEqual(loc, { line: 2, column: 0 });
});

void test("resolveRuleReportLocation uses getLocFromIndex when available and valid", () => {
    const source = "foo;\nbar;";
    const context = makeRuleContext(source, (_index) => ({ line: 99, column: 7 }));
    const loc = resolveRuleReportLocation(context as any, 5);
    assert.deepEqual(loc, { line: 99, column: 7 });
});

void test("resolveRuleReportLocation falls back when getLocFromIndex returns NaN values", () => {
    const source = "abc\ndef";
    const context = makeRuleContext(source, (_index) => ({ line: Number.NaN, column: 0 }));
    // offset 4 is the 'd' in "def"
    const loc = resolveRuleReportLocation(context as any, 4);
    assert.deepEqual(loc, { line: 2, column: 0 });
});

void test("resolveRuleReportLocation clamps out-of-bounds index", () => {
    const source = "hi";
    const context = makeRuleContext(source);
    const loc = resolveRuleReportLocation(context as any, 9999);
    // clamped to source.length=2, same line
    assert.deepEqual(loc, { line: 1, column: 2 });
});

void test("resolveRuleReportLocation handles multiline source correctly", () => {
    const source = "a\nb\nc\nd";
    const context = makeRuleContext(source);
    // offset 6 is 'd' on the 4th line, column 0
    const loc = resolveRuleReportLocation(context as any, 6);
    assert.deepEqual(loc, { line: 4, column: 0 });
});

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
