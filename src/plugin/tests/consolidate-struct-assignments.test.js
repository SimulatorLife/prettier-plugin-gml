import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "node:test";

import { consolidateStructAssignments } from "../src/ast-transforms/consolidate-struct-assignments.js";

const helperSource = `function getNodeStartIndex(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (typeof node.start === "number") {
        return node.start;
    }

    if (node.start && typeof node.start.index === "number") {
        return node.start.index;
    }

    return null;
}

function getNodeEndIndex(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (typeof node.end === "number") {
        return node.end + 1;
    }

    if (node.end && typeof node.end.index === "number") {
        return node.end.index + 1;
    }

    if (typeof node.start === "number") {
        return node.start;
    }

    if (node.start && typeof node.start.index === "number") {
        return node.start.index;
    }

    return null;
}`;

async function loadCommentTracker() {
    const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
    const sourcePath = path.resolve(
        currentDirectory,
        "../src/ast-transforms/consolidate-struct-assignments.js"
    );

    const fileContents = await fs.readFile(sourcePath, "utf8");
    const classStart = fileContents.indexOf("class CommentTracker");

    if (classStart === -1) {
        throw new Error(
            "Unable to locate CommentTracker in consolidate-struct-assignments.js"
        );
    }

    const classSource = fileContents.slice(classStart);
    const moduleSource = `${helperSource}\n${classSource}\nexport { CommentTracker };`;
    const moduleUrl = `data:text/javascript,${encodeURIComponent(moduleSource)}`;

    return import(moduleUrl);
}

describe("CommentTracker", () => {
    it("ignores consumed comments when checking for later comments", async () => {
        const { CommentTracker } = await loadCommentTracker();

        const tracker = new CommentTracker([
            { start: { index: 10 } },
            { start: { index: 20 } }
        ]);

        tracker.consumeEntries([tracker.entries[0]]);

        assert.equal(tracker.hasAfter(5), true);
    });

    it("removes consumed comments from the original collection", async () => {
        const { CommentTracker } = await loadCommentTracker();

        const comments = [{ start: { index: 10 } }, { start: { index: 20 } }];

        const tracker = new CommentTracker(comments);
        tracker.consumeEntries([tracker.entries[0]]);
        tracker.removeConsumedComments();

        assert.deepEqual(
            comments.map((comment) => comment.start.index),
            [20]
        );
    });
});

describe("consolidateStructAssignments", () => {
    it("attaches trailing comments using the fallback comment tools", () => {
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
        };

        const ast = {
            type: "Program",
            body: [initializer, propertyAssignment],
            comments: [trailingComment]
        };

        consolidateStructAssignments(ast);

        assert.equal(structExpression.properties.length, 1);

        const [property] = structExpression.properties;
        assert.equal(Array.isArray(property.comments), true);
        assert.equal(property.comments.length, 1);
        assert.equal(property.comments[0], trailingComment);
        assert.equal(trailingComment.trailing, true);
        assert.equal(trailingComment._structPropertyTrailing, true);
    });
});
