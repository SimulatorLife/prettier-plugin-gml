import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Core } from "../../index.js";

void describe("getSingleBodyStatement", () => {
    void it("returns null for non-block nodes", () => {
        assert.equal(Core.getSingleBodyStatement(null), null);
        assert.equal(Core.getSingleBodyStatement(undefined), null);
        assert.equal(Core.getSingleBodyStatement({ type: "Identifier" }), null);
        assert.equal(Core.getSingleBodyStatement({ type: "ExpressionStatement" }), null);
    });

    void it("returns null when block has no statements", () => {
        const emptyBlock = {
            type: "BlockStatement",
            body: []
        };
        assert.equal(Core.getSingleBodyStatement(emptyBlock), null);
    });

    void it("returns null when block has multiple statements", () => {
        const multipleStatements = {
            type: "BlockStatement",
            body: [{ type: "ExpressionStatement" }, { type: "ReturnStatement" }]
        };
        assert.equal(Core.getSingleBodyStatement(multipleStatements), null);
    });

    void it("returns the single statement when present", () => {
        const singleStatement = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement", argument: null }]
        };
        const result = Core.getSingleBodyStatement(singleStatement);
        assert.notEqual(result, null);
        assert.equal(result?.type, "ReturnStatement");
    });

    void it("returns null when block has comments by default", () => {
        const blockWithComment = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement" }],
            comments: [{ type: "CommentLine", value: "test" }]
        };
        assert.equal(Core.getSingleBodyStatement(blockWithComment), null);
    });

    void it("allows blocks with comments when skipBlockCommentCheck is true", () => {
        const blockWithComment = {
            type: "BlockStatement",
            body: [{ type: "ReturnStatement", argument: null }],
            comments: [{ type: "CommentLine", value: "test" }]
        };
        const result = Core.getSingleBodyStatement(blockWithComment, {
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
        assert.equal(Core.getSingleBodyStatement(blockWithCommentedStatement), null);
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
        const result = Core.getSingleBodyStatement(blockWithCommentedStatement, {
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
        const result = Core.getSingleBodyStatement(fullyCommented, {
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
        assert.equal(Core.getSingleBodyStatement(invalidBlock), null);
    });

    void it("returns null when single statement is null or undefined", () => {
        const blockWithNullStatement = {
            type: "BlockStatement",
            body: [null]
        };
        assert.equal(Core.getSingleBodyStatement(blockWithNullStatement), null);
    });
});
