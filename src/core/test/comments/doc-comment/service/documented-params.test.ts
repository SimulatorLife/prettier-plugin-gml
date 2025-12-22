import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

const {
    buildDocumentedParamNameLookup,
    extractDocumentedParamNames,
    extractParamNameFromComment,
    getCommentEndIndex,
    getCommentStartIndex,
    isWhitespaceBetween,
    normalizeDocParamNameForComparison
} = Core;

type DocCommentTraversalService = ReturnType<
    typeof Core.resolveDocCommentTraversalService
>;

void test("extractParamNameFromComment trims optional references", () => {
    assert.strictEqual(
        extractParamNameFromComment("/ @param foo value"),
        "foo"
    );
    assert.strictEqual(
        extractParamNameFromComment("// @param {number} [bar=1] desc"),
        "bar"
    );
    assert.strictEqual(extractParamNameFromComment("/ @param baz=1"), "baz");
    assert.strictEqual(extractParamNameFromComment("/ @param [qux]"), "qux");
    assert.strictEqual(extractParamNameFromComment("/ @param"), null);
});

void test("normalizeDocParamNameForComparison lowercases names", () => {
    assert.strictEqual(
        normalizeDocParamNameForComparison("  FooBar "),
        "foobar"
    );
    assert.strictEqual(
        normalizeDocParamNameForComparison("[Baz=10]"),
        "[baz=10]"
    );
});

void test("comment boundary helpers read numeric offsets", () => {
    const comment = {
        type: "CommentLine",
        start: { index: 5 },
        end: { index: 12 }
    };

    assert.strictEqual(getCommentStartIndex(comment), 5);
    assert.strictEqual(getCommentEndIndex(comment), 12);
});

void test("isWhitespaceBetween requires only whitespace in the slice", () => {
    const text = "\n  \n    foo";

    assert.strictEqual(isWhitespaceBetween(0, 3, text), true);
    assert.strictEqual(isWhitespaceBetween(0, text.length, text), false);
    assert.strictEqual(isWhitespaceBetween(0, 0, null), true);
});

void test("extractDocumentedParamNames respects contiguous doc comments", () => {
    const functionNode = { type: "FunctionDeclaration", start: 100, end: 110 };
    const comments = [
        { type: "CommentLine", value: "// @param first", start: 10, end: 20 },
        { type: "CommentLine", value: "// @param second", start: 30, end: 40 },
        { type: "CommentLine", value: "// @param after", start: 200, end: 210 }
    ];

    const names = extractDocumentedParamNames(
        functionNode,
        comments,
        "".padEnd(300)
    );

    assert.deepStrictEqual([...names], ["second", "first"]);
});

void test("buildDocumentedParamNameLookup indexes documented parameters", () => {
    const functionNode = { type: "FunctionDeclaration", start: 80, end: 90 };
    const comments = [
        { type: "CommentLine", value: "// @param foo", start: 10, end: 20 }
    ];

    const traversal = {
        forEach(callback: (node: unknown, comments?: unknown[]) => void) {
            callback(functionNode, comments);
        }
    } satisfies DocCommentTraversalService;

    const lookup = buildDocumentedParamNameLookup(
        { type: "Program", comments: [] },
        "".padEnd(200),
        traversal
    );

    const documented = lookup.get(functionNode);
    assert.ok(documented);
    assert.deepStrictEqual([...documented], ["foo"]);
});
