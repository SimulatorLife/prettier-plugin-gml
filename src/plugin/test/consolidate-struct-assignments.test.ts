import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommentTracker, consolidateStructAssignmentsTransform } from "../src/transforms/index.js";

const location = (index: number, line: number) => ({ index, line });

type Range = {
    startIndex: number;
    startLine: number;
    endIndex: number;
    endLine: number;
};

function range(startIndex: number, startLine: number, endIndex: number, endLine: number): Range {
    return { startIndex, startLine, endIndex, endLine };
}

function createStructExpression(range: Range) {
    return {
        type: "StructExpression",
        properties: [],
        start: location(range.startIndex, range.startLine),
        end: location(range.endIndex, range.endLine)
    };
}

function createInitializer(name: string, structExpression: unknown, idRange: Range, declarationRange: Range) {
    return {
        type: "VariableDeclaration",
        declarations: [
            {
                type: "VariableDeclarator",
                id: {
                    type: "Identifier",
                    name,
                    start: location(idRange.startIndex, idRange.startLine),
                    end: location(idRange.endIndex, idRange.endLine)
                },
                init: structExpression,
                start: location(declarationRange.startIndex, declarationRange.startLine),
                end: location(declarationRange.endIndex, declarationRange.endLine)
            }
        ],
        start: location(declarationRange.startIndex, declarationRange.startLine),
        end: location(declarationRange.endIndex, declarationRange.endLine)
    };
}

function createPropertyAssignment(
    objectName: string,
    propertyName: string,
    objectRange: Range,
    propertyRange: Range,
    valueRange: Range,
    value: number
) {
    return {
        type: "AssignmentExpression",
        operator: "=",
        left: {
            type: "MemberDotExpression",
            object: {
                type: "Identifier",
                name: objectName,
                start: location(objectRange.startIndex, objectRange.startLine),
                end: location(objectRange.endIndex, objectRange.endLine)
            },
            property: {
                type: "Identifier",
                name: propertyName,
                start: location(propertyRange.startIndex, propertyRange.startLine),
                end: location(propertyRange.endIndex, propertyRange.endLine)
            },
            start: location(objectRange.startIndex, objectRange.startLine),
            end: location(propertyRange.endIndex, propertyRange.endLine)
        },
        right: {
            type: "Literal",
            value,
            start: location(valueRange.startIndex, valueRange.startLine),
            end: location(valueRange.endIndex, valueRange.endLine)
        },
        start: location(objectRange.startIndex, objectRange.startLine),
        end: location(valueRange.endIndex, valueRange.endLine)
    };
}

void describe("CommentTracker", () => {
    void it("ignores consumed comments when checking for later comments", () => {
        const tracker = new CommentTracker([{ start: { index: 10 } }, { start: { index: 20 } }]);

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

        consolidateStructAssignmentsTransform.transform(ast);

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

        consolidateStructAssignmentsTransform.transform(ast);

        assert.equal(structExpression.properties.length, 1);

        const [property] = structExpression.properties;
        assert.equal(Array.isArray(property._structTrailingComments), true);
        assert.equal(property._structTrailingComments.length, 1);
        const [propertyComment] = property._structTrailingComments;
        assert.equal(propertyComment.leadingChar, ",");
    });

    void it("handles multiple consecutive struct initializers without skipping", () => {
        const struct1 = createStructExpression(range(0, 1, 10, 1));
        const initializer1 = createInitializer("obj1", struct1, range(0, 1, 4, 1), range(0, 1, 10, 1));

        const property1 = createPropertyAssignment(
            "obj1",
            "x",
            range(20, 2, 24, 2),
            range(25, 2, 26, 2),
            range(29, 2, 30, 2),
            1
        );

        const struct2 = createStructExpression(range(40, 3, 50, 3));
        const initializer2 = createInitializer("obj2", struct2, range(40, 3, 44, 3), range(40, 3, 50, 3));

        const property2 = createPropertyAssignment(
            "obj2",
            "y",
            range(60, 4, 64, 4),
            range(65, 4, 66, 4),
            range(69, 4, 70, 4),
            2
        );

        const ast = {
            type: "Program",
            body: [initializer1, property1, initializer2, property2],
            comments: []
        };

        consolidateStructAssignmentsTransform.transform(ast);

        // Both structs should be consolidated
        assert.equal(struct1.properties.length, 1, "First struct should have consolidated property");
        assert.equal(struct1.properties[0].name.name, "x", "First struct property should be x");

        assert.equal(struct2.properties.length, 1, "Second struct should have consolidated property (not skipped)");
        assert.equal(struct2.properties[0].name.name, "y", "Second struct property should be y");

        // The body should only have the two initializers left (properties removed)
        assert.equal(ast.body.length, 2, "Body should only have the two initializers");
        assert.equal(ast.body[0], initializer1, "First item should be initializer1");
        assert.equal(ast.body[1], initializer2, "Second item should be initializer2");
    });

    void it("handles struct initializer immediately after removed properties", () => {
        // First struct with TWO properties to consolidate
        const struct1 = createStructExpression(range(0, 1, 10, 1));
        const initializer1 = createInitializer("obj1", struct1, range(0, 1, 4, 1), range(0, 1, 10, 1));

        const property1a = createPropertyAssignment(
            "obj1",
            "x",
            range(20, 2, 24, 2),
            range(25, 2, 26, 2),
            range(29, 2, 30, 2),
            1
        );

        const property1b = createPropertyAssignment(
            "obj1",
            "y",
            range(35, 3, 39, 3),
            range(40, 3, 41, 3),
            range(44, 3, 45, 3),
            2
        );

        // Second struct immediately after the removed properties
        const struct2 = {
            type: "StructExpression",
            properties: [],
            start: location(50, 4),
            end: location(60, 4)
        };

        const initializer2 = {
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: "obj2",
                        start: location(50, 4),
                        end: location(54, 4)
                    },
                    init: struct2,
                    start: location(50, 4),
                    end: location(60, 4)
                }
            ],
            start: location(50, 4),
            end: location(60, 4)
        };

        // Property for obj2
        const property2 = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberDotExpression",
                object: {
                    type: "Identifier",
                    name: "obj2",
                    start: location(70, 5),
                    end: location(74, 5)
                },
                property: {
                    type: "Identifier",
                    name: "z",
                    start: location(75, 5),
                    end: location(76, 5)
                },
                start: location(70, 5),
                end: location(76, 5)
            },
            right: {
                type: "Literal",
                value: 3,
                start: location(79, 5),
                end: location(80, 5)
            },
            start: location(70, 5),
            end: location(80, 5)
        };

        const ast = {
            type: "Program",
            body: [initializer1, property1a, property1b, initializer2, property2],
            comments: []
        };

        consolidateStructAssignmentsTransform.transform(ast);

        // First struct should consolidate both properties
        assert.equal(struct1.properties.length, 2, "First struct should have two consolidated properties");
        assert.equal(struct1.properties[0].name.name, "x", "First property should be x");
        assert.equal(struct1.properties[1].name.name, "y", "Second property should be y");

        // Second struct should still be processed (not skipped)
        assert.equal(struct2.properties.length, 1, "Second struct should have one consolidated property");
        assert.equal(struct2.properties[0].name.name, "z", "Property should be z");

        // The body should only have the two initializers
        assert.equal(ast.body.length, 2, "Body should only have the two initializers");
        assert.equal(ast.body[0], initializer1, "First item should be initializer1");
        assert.equal(ast.body[1], initializer2, "Second item should be initializer2");
    });

    void it("recursively visits nested blocks after consolidation", () => {
        // Outer struct
        const outerStruct = {
            type: "StructExpression",
            properties: [],
            start: location(0, 1),
            end: location(10, 1)
        };

        const outerInit = {
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: "outer",
                        start: location(0, 1),
                        end: location(5, 1)
                    },
                    init: outerStruct,
                    start: location(0, 1),
                    end: location(10, 1)
                }
            ],
            start: location(0, 1),
            end: location(10, 1)
        };

        const outerProperty = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberDotExpression",
                object: {
                    type: "Identifier",
                    name: "outer",
                    start: location(20, 2),
                    end: location(25, 2)
                },
                property: {
                    type: "Identifier",
                    name: "x",
                    start: location(26, 2),
                    end: location(27, 2)
                },
                start: location(20, 2),
                end: location(27, 2)
            },
            right: {
                type: "Literal",
                value: 1,
                start: location(30, 2),
                end: location(31, 2)
            },
            start: location(20, 2),
            end: location(31, 2)
        };

        // Nested block with its own struct
        const innerStruct = {
            type: "StructExpression",
            properties: [],
            start: location(50, 3),
            end: location(60, 3)
        };

        const innerInit = {
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: "inner",
                        start: location(50, 3),
                        end: location(55, 3)
                    },
                    init: innerStruct,
                    start: location(50, 3),
                    end: location(60, 3)
                }
            ],
            start: location(50, 3),
            end: location(60, 3)
        };

        const innerProperty = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberDotExpression",
                object: {
                    type: "Identifier",
                    name: "inner",
                    start: location(70, 4),
                    end: location(75, 4)
                },
                property: {
                    type: "Identifier",
                    name: "y",
                    start: location(76, 4),
                    end: location(77, 4)
                },
                start: location(70, 4),
                end: location(77, 4)
            },
            right: {
                type: "Literal",
                value: 2,
                start: location(80, 4),
                end: location(81, 4)
            },
            start: location(70, 4),
            end: location(81, 4)
        };

        const ifStatement = {
            type: "IfStatement",
            test: {
                type: "Literal",
                value: "true",
                start: location(40, 3),
                end: location(44, 3)
            },
            consequent: {
                type: "BlockStatement",
                body: [innerInit, innerProperty],
                start: location(45, 3),
                end: location(90, 5)
            },
            start: location(35, 3),
            end: location(90, 5)
        };

        const ast = {
            type: "Program",
            body: [outerInit, outerProperty, ifStatement],
            comments: []
        };

        consolidateStructAssignmentsTransform.transform(ast);

        // Outer struct should be consolidated
        assert.equal(outerStruct.properties.length, 1, "Outer struct should have consolidated property");
        assert.equal(outerStruct.properties[0].name.name, "x", "Outer struct property should be x");

        // Inner struct should also be consolidated (verifying recursive visitation works)
        assert.equal(innerStruct.properties.length, 1, "Inner struct should have consolidated property");
        assert.equal(innerStruct.properties[0].name.name, "y", "Inner struct property should be y");

        // Verify the nested block was mutated correctly
        assert.equal(ifStatement.consequent.body.length, 1, "Nested block should only have the initializer");
        assert.equal(ifStatement.consequent.body[0], innerInit, "Nested block should have innerInit");
    });
});
