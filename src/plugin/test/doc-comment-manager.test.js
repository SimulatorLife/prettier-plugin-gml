import assert from "node:assert/strict";
import test from "node:test";

import {
    resolveDocCommentTraversalService,
    resolveDocCommentLookupService,
    resolveDocCommentDescriptionService,
    resolveDocCommentUpdateService
} from "../src/comments/doc-comment-manager.js";

test("doc comment services expose segregated contracts", () => {
    const ast = { type: "Program", body: [] };

    const traversal = resolveDocCommentTraversalService(ast);
    const lookup = resolveDocCommentLookupService(ast);
    const descriptions = resolveDocCommentDescriptionService(ast);
    const updates = resolveDocCommentUpdateService(ast);

    assert.ok(Object.isFrozen(traversal));
    assert.ok(Object.isFrozen(lookup));
    assert.ok(Object.isFrozen(descriptions));
    assert.ok(Object.isFrozen(updates));

    assert.deepStrictEqual(Object.keys(traversal), ["forEach"]);
    assert.deepStrictEqual(Object.keys(lookup), [
        "getComments",
        "hasDocComment"
    ]);
    assert.deepStrictEqual(Object.keys(descriptions), ["extractDescription"]);
    assert.deepStrictEqual(Object.keys(updates), ["applyUpdates"]);

    assert.strictEqual(typeof traversal.forEach, "function");
    assert.strictEqual(typeof lookup.getComments, "function");
    assert.strictEqual(typeof lookup.hasDocComment, "function");
    assert.strictEqual(typeof descriptions.extractDescription, "function");
    assert.strictEqual(typeof updates.applyUpdates, "function");
});

test("doc comment services reuse cached views and tolerate missing AST", () => {
    const ast = { type: "Program", body: [] };

    const firstTraversal = resolveDocCommentTraversalService(ast);
    const secondTraversal = resolveDocCommentTraversalService(ast);
    const firstLookup = resolveDocCommentLookupService(ast);
    const secondLookup = resolveDocCommentLookupService(ast);
    const firstDescriptions = resolveDocCommentDescriptionService(ast);
    const secondDescriptions = resolveDocCommentDescriptionService(ast);
    const firstUpdates = resolveDocCommentUpdateService(ast);
    const secondUpdates = resolveDocCommentUpdateService(ast);

    assert.strictEqual(firstTraversal, secondTraversal);
    assert.strictEqual(firstLookup, secondLookup);
    assert.strictEqual(firstDescriptions, secondDescriptions);
    assert.strictEqual(firstUpdates, secondUpdates);

    const noopTraversal = resolveDocCommentTraversalService(null);
    const noopLookup = resolveDocCommentLookupService(null);
    const noopDescriptions = resolveDocCommentDescriptionService();
    const noopUpdates = resolveDocCommentUpdateService();

    let visited = false;
    noopTraversal.forEach(() => {
        visited = true;
    });
    assert.strictEqual(visited, false);

    assert.deepStrictEqual(noopLookup.getComments({}), []);
    assert.strictEqual(noopLookup.hasDocComment({}), false);
    assert.strictEqual(noopDescriptions.extractDescription({}), null);
    assert.doesNotThrow(() => noopUpdates.applyUpdates(new Map()));
});
