import assert from "node:assert/strict";
import test from "node:test";

import {
    cloneAstNodeWithoutTraversalLinks,
    createCommentTokenRangeIndex,
    findFirstAstNodeBy,
    isAssignmentExpressionNodeWithOperator,
    rangeContainsCommentToken,
    resolveLocFromIndex,
    sourceRangeContainsCommentToken,
    walkAstNodes
} from "../../src/rules/gml/rule-base-helpers.js";
import { assertEquals } from "../assertions.js";

const isIncrementAssignmentOperator = (operator: unknown): operator is "+=" | "-=" =>
    operator === "+=" || operator === "-=";
const isSimpleAssignmentOperator = (operator: unknown): operator is "=" => operator === "=";

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

void test("sourceRangeContainsCommentToken detects line and block comment markers within the requested span", () => {
    const sourceText = [
        "var plain = 1;",
        "var withLine = 2; // inline",
        "/* block */ var withBlock = 3;",
        "var tail = 4;"
    ].join("\n");

    const plainStart = sourceText.indexOf("var plain = 1;");
    const plainEnd = plainStart + "var plain = 1;".length;
    const lineStart = sourceText.indexOf("var withLine = 2;");
    const lineEnd = lineStart + "var withLine = 2; // inline".length;
    const blockStart = sourceText.indexOf("/* block */");
    const blockEnd = blockStart + "/* block */".length;

    assert.equal(sourceRangeContainsCommentToken(sourceText, plainStart, plainEnd), false);
    assert.equal(sourceRangeContainsCommentToken(sourceText, lineStart, lineEnd), true);
    assert.equal(sourceRangeContainsCommentToken(sourceText, blockStart, blockEnd), true);
});

void test("rangeContainsCommentToken uses the prefix index to detect comment markers without rescanning", () => {
    const sourceText = [
        "value = 1;",
        'message = "not // a comment";',
        "score = 2; // inline",
        "/* banner */ total = 3;"
    ].join("\n");
    const commentTokenRangeIndex = createCommentTokenRangeIndex(sourceText);

    const plainStart = sourceText.indexOf("value = 1;");
    const plainEnd = plainStart + "value = 1;".length;
    const inlineStart = sourceText.indexOf("score = 2;");
    const inlineEnd = inlineStart + "score = 2; // inline".length;
    const blockStart = sourceText.indexOf("/* banner */");
    const blockEnd = blockStart + "/* banner */".length;

    assert.equal(rangeContainsCommentToken(commentTokenRangeIndex, plainStart, plainEnd), false);
    assert.equal(rangeContainsCommentToken(commentTokenRangeIndex, inlineStart, inlineEnd), true);
    assert.equal(rangeContainsCommentToken(commentTokenRangeIndex, blockStart, blockEnd), true);
});

void test("isAssignmentExpressionNodeWithOperator matches assignment nodes with accepted operators", () => {
    const node = {
        type: "AssignmentExpression",
        operator: "+=",
        left: { type: "Identifier", name: "count" },
        right: { type: "Literal", value: "1" }
    };

    assert.equal(isAssignmentExpressionNodeWithOperator(node, isIncrementAssignmentOperator), true);
});

void test("isAssignmentExpressionNodeWithOperator rejects non-assignment and missing-key candidates", () => {
    assert.equal(
        isAssignmentExpressionNodeWithOperator(
            {
                type: "AssignmentExpression",
                operator: "=",
                left: { type: "Identifier", name: "value" }
            },
            isSimpleAssignmentOperator
        ),
        false
    );
    assert.equal(
        isAssignmentExpressionNodeWithOperator(
            {
                type: "BinaryExpression",
                operator: "=",
                left: { type: "Identifier", name: "value" },
                right: { type: "Literal", value: "1" }
            },
            isSimpleAssignmentOperator
        ),
        false
    );
});

// Helper that produces a minimal Rule.RuleContext stub for resolveLocFromIndex tests.
// The stub can optionally expose a getLocFromIndex implementation on sourceCode.
function createStubRuleContext(
    sourceText: string,
    getLocFromIndex?: (index: number) => { line: number; column: number } | undefined
): import("eslint").Rule.RuleContext {
    return {
        sourceCode: {
            text: sourceText,
            ...(getLocFromIndex === undefined ? {} : { getLocFromIndex })
        }
    } as unknown as import("eslint").Rule.RuleContext;
}

void test("resolveLocFromIndex returns line 1 column 0 for index 0 in a single-line source", () => {
    const context = createStubRuleContext("var x = 1;");
    const loc = resolveLocFromIndex(context, "var x = 1;", 0);
    assert.deepEqual(loc, { line: 1, column: 0 });
});

void test("resolveLocFromIndex advances to the correct column within line 1", () => {
    const context = createStubRuleContext("var x = 1;");
    // index 4 is the 'x' character on the first (and only) line
    const loc = resolveLocFromIndex(context, "var x = 1;", 4);
    assert.deepEqual(loc, { line: 1, column: 4 });
});

void test("resolveLocFromIndex increments line number after each newline", () => {
    const source = "line1\nline2\nline3";
    const context = createStubRuleContext(source);
    // index of the 'l' in 'line3' is 12
    const indexOfLine3 = source.indexOf("line3");
    const loc = resolveLocFromIndex(context, source, indexOfLine3);
    assert.deepEqual(loc, { line: 3, column: 0 });
});

void test("resolveLocFromIndex clamps a negative index to line 1 column 0", () => {
    const context = createStubRuleContext("abc");
    const loc = resolveLocFromIndex(context, "abc", -5);
    assert.deepEqual(loc, { line: 1, column: 0 });
});

void test("resolveLocFromIndex clamps an index beyond source length to the end", () => {
    const source = "abc";
    const context = createStubRuleContext(source);
    const loc = resolveLocFromIndex(context, source, 9999);
    assert.deepEqual(loc, { line: 1, column: source.length });
});

void test("resolveLocFromIndex prefers getLocFromIndex when it returns a valid location", () => {
    const source = "foo\nbar";
    const stubbedLoc = { line: 99, column: 42 };
    const context = createStubRuleContext(source, () => stubbedLoc);
    const loc = resolveLocFromIndex(context, source, 0);
    assert.deepEqual(loc, stubbedLoc);
});

void test("resolveLocFromIndex falls back to manual scan when getLocFromIndex returns undefined", () => {
    const source = "hello\nworld";
    const context = createStubRuleContext(source, () => undefined);
    // index of 'w' in 'world' is 6
    const loc = resolveLocFromIndex(context, source, 6);
    assert.deepEqual(loc, { line: 2, column: 0 });
});

void test("resolveLocFromIndex falls back to manual scan when getLocFromIndex returns non-finite coords", () => {
    const source = "hello\nworld";
    const context = createStubRuleContext(source, () => ({ line: Number.NaN, column: 0 }));
    const loc = resolveLocFromIndex(context, source, 6);
    assert.deepEqual(loc, { line: 2, column: 0 });
});
