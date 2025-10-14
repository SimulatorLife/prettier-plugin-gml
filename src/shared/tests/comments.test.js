import assert from "node:assert/strict";
import test from "node:test";

import {
    collectCommentNodes,
    getCommentArray,
    hasComment,
    isBlockComment,
    isCommentNode,
    isDocCommentLine,
    isLineComment
} from "../comments.js";

test("isCommentNode differentiates comment nodes", () => {
    assert.equal(isCommentNode(null), false);
    assert.equal(isCommentNode({ type: "Program" }), false);
    assert.equal(
        isCommentNode({ type: "CommentLine", value: "example" }),
        true
    );
    assert.equal(isCommentNode({ type: "CommentBlock" }), true);
});

test("line and block helpers classify comment nodes", () => {
    const line = { type: "CommentLine", value: "// comment" };
    const block = { type: "CommentBlock", value: "/* comment */" };

    assert.equal(isLineComment(line), true);
    assert.equal(isLineComment(block), false);
    assert.equal(isBlockComment(block), true);
    assert.equal(isBlockComment(line), false);
});

test("hasComment reports when nodes contain comments", () => {
    const nodeWithComment = {
        comments: [{ type: "CommentLine", value: "// comment" }]
    };
    const nodeWithoutComment = { comments: [] };
    const nodeWithoutCommentsProperty = {};

    assert.equal(hasComment(nodeWithComment), true);
    assert.equal(hasComment(nodeWithoutComment), false);
    assert.equal(hasComment(nodeWithoutCommentsProperty), false);
});

test("getCommentArray normalizes comment collections", () => {
    const comment = { type: "CommentLine", value: "// comment" };
    const nodeWithComments = { comments: [comment] };
    const nodeWithoutComments = {};
    const nodeWithInvalidComments = { comments: "not an array" };

    assert.equal(getCommentArray(nodeWithComments), nodeWithComments.comments);
    assert.deepEqual(getCommentArray(nodeWithoutComments), []);
    assert.deepEqual(getCommentArray(nodeWithInvalidComments), []);
    assert.deepEqual(getCommentArray(null), []);
});

test("collectCommentNodes finds nested comment nodes", () => {
    const lineComment = { type: "CommentLine", value: "root" };
    const blockComment = { type: "CommentBlock", value: "nested" };
    const functionComment = { type: "CommentLine", value: "function" };

    const ast = {
        type: "Program",
        comments: [lineComment],
        body: [
            {
                type: "FunctionDeclaration",
                comments: [functionComment, null],
                body: {
                    type: "BlockStatement",
                    comments: [blockComment],
                    body: []
                }
            }
        ]
    };

    const collected = collectCommentNodes(ast);
    assert.equal(collected.length, 3);
    assert.ok(collected.includes(lineComment));
    assert.ok(collected.includes(blockComment));
    assert.ok(collected.includes(functionComment));
});

test("isDocCommentLine recognises doc-style comments", () => {
    assert.equal(
        isDocCommentLine({ type: "CommentLine", value: "/ @description" }),
        true
    );
    assert.equal(
        isDocCommentLine({ type: "CommentLine", value: "/@param foo" }),
        true
    );
    assert.equal(
        isDocCommentLine({ type: "CommentLine", value: "// regular" }),
        false
    );
    assert.equal(
        isDocCommentLine({ type: "CommentBlock", value: "/* */" }),
        false
    );
});
