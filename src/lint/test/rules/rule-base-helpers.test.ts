import assert from "node:assert/strict";
import test from "node:test";

import { findFirstAstNodeBy, resolveSafeLocFromIndex, walkAstNodes } from "../../src/rules/gml/rule-base-helpers.js";

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
    source: string,
    getLocFromIndex?: (index: number) => { line: number; column: number }
): import("eslint").Rule.RuleContext {
    return {
        sourceCode: {
            text: source,
            ...(getLocFromIndex ? { getLocFromIndex } : {})
        }
    } as unknown as import("eslint").Rule.RuleContext;
}

void test("resolveSafeLocFromIndex uses getLocFromIndex when available and result is valid", () => {
    const source = "var x = 1;\nvar y = 2;";
    const context = makeContext(source, (i) => ({ line: 99, column: i }));

    const loc = resolveSafeLocFromIndex(context, 5);

    assert.deepEqual(loc, { line: 99, column: 5 });
});

void test("resolveSafeLocFromIndex falls back to linear scan when getLocFromIndex is absent", () => {
    // "line1\nline2\nline3"
    //  01234 5 67891 0 ...
    const source = "line1\nline2\nline3";
    const context = makeContext(source);

    assert.deepEqual(resolveSafeLocFromIndex(context, 0), { line: 1, column: 0 });
    assert.deepEqual(resolveSafeLocFromIndex(context, 6), { line: 2, column: 0 });
    assert.deepEqual(resolveSafeLocFromIndex(context, 9), { line: 2, column: 3 });
    assert.deepEqual(resolveSafeLocFromIndex(context, 12), { line: 3, column: 0 });
});

void test("resolveSafeLocFromIndex falls back to linear scan when getLocFromIndex returns invalid result", () => {
    const source = "abc\ndef";
    const context = makeContext(source, () => ({ line: Number.NaN, column: 0 }));

    // fallback: offset 4 is start of second line
    assert.deepEqual(resolveSafeLocFromIndex(context, 4), { line: 2, column: 0 });
});

void test("resolveSafeLocFromIndex clamps out-of-range indices", () => {
    const source = "hello";
    const context = makeContext(source);

    assert.deepEqual(resolveSafeLocFromIndex(context, -5), { line: 1, column: 0 });
    assert.deepEqual(resolveSafeLocFromIndex(context, 9999), { line: 1, column: 5 });
});

void test("resolveSafeLocFromIndex treats non-finite index as 0", () => {
    const source = "hello";
    const context = makeContext(source);

    assert.deepEqual(resolveSafeLocFromIndex(context, Number.NaN), { line: 1, column: 0 });
    assert.deepEqual(resolveSafeLocFromIndex(context, Infinity), { line: 1, column: 0 });
});
