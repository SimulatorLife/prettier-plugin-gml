import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

const docPrinterDeps = {
    resolveLineCommentOptions: () => ({}),
    formatLineComment(comment: any) {
        return typeof comment?.value === "string" ? comment.value : "";
    },
    getLineCommentRawText(comment: any) {
        return typeof comment?.value === "string" ? comment.value : "";
    }
};

function createLineComment(text: string, start = 0, end = start) {
    return {
        type: "CommentLine",
        value: text,
        start: { index: start },
        end: { index: end }
    };
}

void test("collectSyntheticDocCommentLines prefers node-level doc comments", () => {
    const node = {
        comments: [createLineComment("/// @function local", 2, 10)],
        start: { index: 20 }
    };
    const result = Core.collectSyntheticDocCommentLines(
        node,
        {},
        null,
        null,
        docPrinterDeps
    );

    assert.deepStrictEqual(result.existingDocLines, [
        "/// @function local"
    ]);
    assert.deepStrictEqual(result.remainingComments, []);
});

void test("collectSyntheticDocCommentLines falls back to program-level comments", () => {
    const docComment = createLineComment("/// @function program", 0, 3);
    const node = { comments: [], start: { index: 40 } };
    const programNode = {
        comments: [docComment]
    };
    const sourceText = "/// @function program\nfunction entry() {}";

    const result = Core.collectSyntheticDocCommentLines(
        node,
        {},
        programNode,
        sourceText,
        docPrinterDeps
    );

    assert.deepStrictEqual(result.existingDocLines, [
        "/// @function program"
    ]);
});

void test("collectLeadingProgramLineComments returns plain // comments", () => {
    const programNode = {
        comments: [
            createLineComment("// banner", 0, 8),
            createLineComment("// following", 9, 18)
        ]
    };
    const node = { start: { index: 25 } };

    const lines = Core.collectLeadingProgramLineComments(
        node,
        programNode,
        {},
        "// banner\n// following\nfunction foo() {}",
        docPrinterDeps
    );

    assert.deepStrictEqual(lines, ["// banner", "// following"]);
});

void test("extractLeadingNonDocCommentLines keeps plain comments only", () => {
    const comments = [
        createLineComment("// plain", 0, 4),
        createLineComment("/// @description", 5, 10)
    ];

    const { leadingLines, remainingComments } =
        Core.extractLeadingNonDocCommentLines(
            comments,
            {},
            docPrinterDeps
        );

    assert.deepStrictEqual(leadingLines, ["// plain"]);
    assert.strictEqual(
        remainingComments[0]?.value,
        "/// @description"
    );
});

void test("collectAdjacentLeadingSourceLineComments gathers contiguous source lines", () => {
    const sourceText = [
        "// first",
        "// second",
        "",
        "function go() {}"
    ].join("\n");
    const node = { start: { index: sourceText.indexOf("function") } };

    const lines = Core.collectAdjacentLeadingSourceLineComments(
        node,
        {},
        sourceText
    );

    assert.deepStrictEqual(lines, ["// first", "// second"]);
});
