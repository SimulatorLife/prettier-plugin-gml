import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "node:test";

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
        throw new Error("Unable to locate CommentTracker in consolidate-struct-assignments.js");
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
});
