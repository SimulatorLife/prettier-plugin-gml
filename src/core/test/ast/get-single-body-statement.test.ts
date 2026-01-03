import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSingleBodyStatement } from "../../src/ast/node-helpers.js";

void describe("getSingleBodyStatement", () => {
    void it("returns null for non-block nodes", () => {
        assert.equal(getSingleBodyStatement(null), null);
        assert.equal(getSingleBodyStatement(undefined), null);
        assert.equal(getSingleBodyStatement({ type: "Identifier" }), null);
        assert.equal(getSingleBodyStatement({ type: "ExpressionStatement" }), null);
    });

    void it("returns null when block has no statements", () => {
        const emptyBlock = {
            type: "BlockStatement",
            body: []
        };
        assert.equal(getSingleBodyStatement(emptyBlock), null);
    });

    void it("returns null when block has multiple statements", () => {
        const multipleStatements = {
            type: "BlockStatement",
            body: [{ type: "ExpressionStatement" }, { type: "ReturnStatement" }]
        };
        assert.equal(getSingleBodyStatement(multipleStatements), null);
    });

    void it("returns the single statement when present", () => {
        const singleStatement = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement", argument: null }]
        };
        const result = getSingleBodyStatement(singleStatement);
        assert.notEqual(result, null);
        assert.equal(result?.type, "ReturnStatement");
    });

    void it("returns null when block has comments by default", () => {
        const blockWithComment = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement" }],
            comments: [{ type: "CommentLine", value: "test" }]
        };
        assert.equal(getSingleBodyStatement(blockWithComment), null);
    });

    void it("allows blocks with comments when skipBlockCommentCheck is true", () => {
        const blockWithComment = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement", argument: null }],
            comments: [{ type: "CommentLine", value: "test" }]
        };
        const result = getSingleBodyStatement(blockWithComment, {
            skipBlockCommentCheck: true
        });
        assert.notEqual(result, null);
        assert.equal(result?.type, "ReturnStatement");
    });

    void it("returns null when statement has comments by default", () => {
        const blockWithCommentedStatement = {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: null,
                    comments: [{ type: "CommentLine", value: "test" }]
                }
            ]
        };
        assert.equal(getSingleBodyStatement(blockWithCommentedStatement), null);
    });

    void it("allows statements with comments when skipStatementCommentCheck is true", () => {
        const blockWithCommentedStatement = {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: null,
                    comments: [{ type: "CommentLine", value: "test" }]
                }
            ]
        };
        const result = getSingleBodyStatement(blockWithCommentedStatement, {
            skipStatementCommentCheck: true
        });
        assert.notEqual(result, null);
        assert.equal(result?.type, "ReturnStatement");
    });

    void it("can skip both comment checks", () => {
        const fullyCommented = {
            type: "BlockStatement",
            body: [
                {
                    type: "ReturnStatement",
                    argument: null,
                    comments: [{ type: "CommentLine", value: "stmt" }]
                }
            ],
            comments: [{ type: "CommentLine", value: "block" }]
        };
        const result = getSingleBodyStatement(fullyCommented, {
            skipBlockCommentCheck: true,
            skipStatementCommentCheck: true
        });
        assert.notEqual(result, null);
        assert.equal(result?.type, "ReturnStatement");
    });

    void it("returns null when body is not an array", () => {
        const invalidBlock = {
            type: "BlockStatement",
            body: null
        };
        assert.equal(getSingleBodyStatement(invalidBlock), null);
    });

    void it("returns null when single statement is null or undefined", () => {
        const blockWithNullStatement = {
            type: "BlockStatement",
            body: [null]
        };
        assert.equal(getSingleBodyStatement(blockWithNullStatement), null);
    });
});
