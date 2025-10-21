import assert from "node:assert/strict";
import test from "node:test";

import {
    getDocCommentManager,
    resolveDocCommentInspectionService,
    resolveDocCommentUpdateService
} from "../src/comments/doc-comment-manager.js";

test("doc comment services expose segregated contracts", () => {
    const ast = { type: "Program", body: [] };

    const manager = getDocCommentManager(ast);
    const inspection = resolveDocCommentInspectionService(ast);
    const updates = resolveDocCommentUpdateService(ast);

    assert.ok(Object.isFrozen(inspection));
    assert.ok(Object.isFrozen(updates));

    assert.deepStrictEqual(Object.keys(inspection), [
        "forEach",
        "getComments",
        "extractDescription",
        "hasDocComment"
    ]);
    assert.deepStrictEqual(Object.keys(updates), ["applyUpdates"]);

    assert.ok(
        inspection.forEach.name.endsWith(manager.forEach.name),
        "forEach binding should preserve original function name"
    );
    assert.ok(
        inspection.getComments.name.endsWith(manager.getComments.name),
        "getComments binding should preserve original function name"
    );
    assert.ok(
        inspection.extractDescription.name.endsWith(
            manager.extractDescription.name
        ),
        "extractDescription binding should preserve original function name"
    );
    assert.ok(
        inspection.hasDocComment.name.endsWith(manager.hasDocComment.name),
        "hasDocComment binding should preserve original function name"
    );
    assert.ok(
        updates.applyUpdates.name.endsWith(manager.applyUpdates.name),
        "applyUpdates binding should preserve original function name"
    );
});

test("doc comment services reuse cached views and tolerate missing AST", () => {
    const ast = { type: "Program", body: [] };

    const firstInspection = resolveDocCommentInspectionService(ast);
    const secondInspection = resolveDocCommentInspectionService(ast);
    const firstUpdates = resolveDocCommentUpdateService(ast);
    const secondUpdates = resolveDocCommentUpdateService(ast);

    assert.strictEqual(firstInspection, secondInspection);
    assert.strictEqual(firstUpdates, secondUpdates);

    const noopInspection = resolveDocCommentInspectionService(null);
    const noopUpdates = resolveDocCommentUpdateService();

    assert.deepStrictEqual(noopInspection.getComments({}), []);
    assert.strictEqual(noopInspection.hasDocComment({}), false);
    assert.doesNotThrow(() => noopUpdates.applyUpdates(new Map()));
});
