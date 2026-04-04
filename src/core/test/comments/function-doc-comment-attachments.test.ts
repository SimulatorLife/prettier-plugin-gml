import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeFunctionDocCommentAttachments } from "../../src/comments/doc-comment/function-doc-comment-attachments.js";

void test("normalizeFunctionDocCommentAttachments attaches reachable function tag comments", () => {
    const comment: {
        type: string;
        value: string;
        start: { index: number };
        end: { index: number };
        _gmlAttachedDocComment?: boolean;
    } = {
        type: "CommentLine",
        value: "/// @function demo()",
        start: { index: 0 },
        end: { index: 19 }
    };
    const functionNode: {
        type: string;
        start: { index: number };
        end: { index: number };
        docComments?: unknown[];
    } = {
        type: "FunctionDeclaration",
        start: { index: 20 },
        end: { index: 38 }
    };
    const rootNode = {
        type: "Program",
        body: [functionNode]
    };
    const sourceText = ["/// @function demo()", "function demo() {}", ""].join("\n");

    normalizeFunctionDocCommentAttachments(rootNode, [comment], sourceText);

    assert.deepStrictEqual(functionNode.docComments, [comment]);
    assert.equal(comment._gmlAttachedDocComment, true);
});

void test("normalizeFunctionDocCommentAttachments does not cross non-comment code when finding a target", () => {
    const comment: {
        type: string;
        value: string;
        start: { index: number };
        end: { index: number };
        _gmlAttachedDocComment?: boolean;
    } = {
        type: "CommentLine",
        value: "/// @function demo()",
        start: { index: 0 },
        end: { index: 19 }
    };
    const functionNode: {
        type: string;
        start: { index: number };
        end: { index: number };
        docComments?: unknown[];
    } = {
        type: "FunctionDeclaration",
        start: { index: 31 },
        end: { index: 49 }
    };
    const rootNode = {
        type: "Program",
        body: [functionNode]
    };
    const sourceText = ["/// @function demo()", "var blocker = 1;", "function demo() {}", ""].join("\n");

    normalizeFunctionDocCommentAttachments(rootNode, [comment], sourceText);

    assert.equal(functionNode.docComments, undefined);
    assert.equal(comment._gmlAttachedDocComment, undefined);
});
