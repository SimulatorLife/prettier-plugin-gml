import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

type DocCommentTraversalService = ReturnType<
    typeof Core.resolveDocCommentTraversalService
>;

void test("collectDeprecatedFunctionNames identifies top-level deprecated functions", () => {
    const functionNode = {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "legacyFunction" },
        start: 60,
        end: 80
    };
    const comments = [
        { type: "CommentLine", value: "// @deprecated", start: 10, end: 20 }
    ];

    const traversal = {
        forEach(callback: (node: unknown, comments?: unknown[]) => void) {
            callback(functionNode, comments);
        }
    } satisfies DocCommentTraversalService;

    const names = Core.collectDeprecatedFunctionNames(
        { type: "Program", body: [functionNode], comments: [] },
        " ".repeat(120),
        traversal
    );

    assert.deepStrictEqual([...names], ["legacyFunction"]);
});

void test("collectDeprecatedFunctionNames ignores functions without whitespace before start", () => {
    const functionNode = {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "legacyFunction" },
        start: 60,
        end: 80
    };
    const comments = [
        { type: "CommentLine", value: "// @deprecated", start: 10, end: 20 }
    ];

    const traversal = {
        forEach(callback: (node: unknown, comments?: unknown[]) => void) {
            callback(functionNode, comments);
        }
    } satisfies DocCommentTraversalService;

    const names = Core.collectDeprecatedFunctionNames(
        { type: "Program", body: [functionNode], comments: [] },
        `${" ".repeat(30)}X${" ".repeat(120)}`,
        traversal
    );

    assert.deepStrictEqual([...names], []);
});

void test("findDeprecatedDocComment returns the matching line when whitespace is preserved", () => {
    const comment = {
        type: "CommentLine",
        value: "// @deprecated",
        start: 10,
        end: 20
    };

    const found = Core.findDeprecatedDocComment([comment], 30, " ".repeat(120));

    assert.strictEqual(found, comment);
});

void test("findDeprecatedDocComment ignores comments separated by non-whitespace", () => {
    const comment = {
        type: "CommentLine",
        value: "// @deprecated",
        start: 10,
        end: 20
    };

    const found = Core.findDeprecatedDocComment(
        [comment],
        30,
        `${" ".repeat(25)}X${" ".repeat(120)}`
    );

    assert.strictEqual(found, null);
});
