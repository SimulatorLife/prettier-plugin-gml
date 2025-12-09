import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    CommentTracker,
    consolidateStructAssignments
} from "../src/transforms/index.js";

void describe("CommentTracker", () => {
    void it("ignores consumed comments when checking for later comments", () => {
        const tracker = new CommentTracker([
            { start: { index: 10 } },
            { start: { index: 20 } }
        ]);

        tracker.consumeEntries([tracker.entries[0]]);

        assert.equal(tracker.hasAfter(5), true);
    });

    void it("removes consumed comments from the original collection", () => {
        const comments = [{ start: { index: 10 } }, { start: { index: 20 } }];

        const tracker = new CommentTracker(comments);
        tracker.consumeEntries([tracker.entries[0]]);
        tracker.removeConsumedComments();

        assert.deepEqual(
            comments.map((comment) => comment.start.index),
            [20]
        );
    });

    void it("correctly takes multiple consecutive matching comments without skipping", () => {
        const comments = [
            { start: { index: 10 }, type: "match" },
            { start: { index: 20 }, type: "match" },
            { start: { index: 30 }, type: "skip" },
            { start: { index: 40 }, type: "match" },
            { start: { index: 50 }, type: "match" }
        ];

        const tracker = new CommentTracker(comments);
        const predicate = (comment) => comment.type === "match";
        const taken = tracker.takeBetween(5, 100, predicate);

        assert.equal(taken.length, 4);
        assert.deepEqual(
            taken.map((c) => c.start.index),
            [10, 20, 40, 50]
        );
        assert.equal(tracker.entries.length, 1);
        assert.equal((tracker.entries[0].comment as any).start.index, 30);
    });
});

void describe("consolidateStructAssignments", () => {
    void it("attaches trailing comments using the fallback comment tools", () => {
        const location = (index, line) => ({ index, line });

        const structExpression = {
            type: "StructExpression",
            properties: [],
            start: location(0, 1),
            end: location(10, 1)
        };

        const initializer = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "Identifier",
                name: "state",
                start: location(0, 1),
                end: location(5, 1)
            },
            right: structExpression,
            start: location(0, 1),
            end: location(10, 1)
        };

        const propertyAssignment = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberDotExpression",
                object: {
                    type: "Identifier",
                    name: "state",
                    start: location(20, 2),
                    end: location(25, 2)
                },
                property: {
                    type: "Identifier",
                    name: "value",
                    start: location(30, 2),
                    end: location(35, 2)
                },
                start: location(20, 2),
                end: location(35, 2)
            },
            right: {
                type: "Literal",
                value: 1,
                start: location(38, 2),
                end: location(39, 2)
            },
            start: location(20, 2),
            end: location(39, 2)
        };

        const trailingComment = {
            type: "CommentLine",
            value: " property",
            start: location(45, 2),
            end: location(55, 2)
        } as any;

        const ast = {
            type: "Program",
            body: [initializer, propertyAssignment],
            comments: [trailingComment]
        };

        consolidateStructAssignments(ast);

        assert.equal(structExpression.properties.length, 1);

        const property = structExpression.properties[0];
        assert.equal(Array.isArray(property._structTrailingComments), true);
        assert.equal(property._structTrailingComments.length, 1);
        assert.equal(property._structTrailingComments[0], trailingComment);
        assert.equal(trailingComment.trailing, false);
        assert.equal(trailingComment._structPropertyTrailing, true);
        assert.equal(trailingComment._removedByConsolidation, true);
        assert.equal(property._hasTrailingInlineComment, true);
    });

    void it("normalizes inline comment leading characters for consolidated struct properties", () => {
        const location = (index, line) => ({ index, line });

        const structExpression = {
            type: "StructExpression",
            properties: [],
            start: location(0, 1),
            end: location(10, 1)
        };

        const initializer = {
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: "stats",
                        start: location(0, 1),
                        end: location(5, 1)
                    },
                    init: structExpression,
                    start: location(0, 1),
                    end: location(10, 1)
                }
            ],
            start: location(0, 1),
            end: location(10, 1)
        };

        const propertyAssignment = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberDotExpression",
                object: {
                    type: "Identifier",
                    name: "stats",
                    start: location(20, 2),
                    end: location(25, 2)
                },
                property: {
                    type: "Identifier",
                    name: "hp",
                    start: location(26, 2),
                    end: location(28, 2)
                },
                start: location(20, 2),
                end: location(28, 2)
            },
            right: {
                type: "Literal",
                value: "100",
                start: location(31, 2),
                end: location(34, 2)
            },
            start: location(20, 2),
            end: location(34, 2)
        };

        const trailingComment = {
            type: "CommentLine",
            value: " base health",
            start: location(38, 2),
            end: location(51, 2),
            leadingChar: ";"
        };

        const ast = {
            type: "Program",
            body: [initializer, propertyAssignment],
            comments: [trailingComment]
        };

        consolidateStructAssignments(ast);

        assert.equal(structExpression.properties.length, 1);

        const [property] = structExpression.properties;
        assert.equal(Array.isArray(property._structTrailingComments), true);
        assert.equal(property._structTrailingComments.length, 1);
        const [propertyComment] = property._structTrailingComments;
        assert.equal(propertyComment.leadingChar, ",");
    });
});
