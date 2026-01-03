import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

type DocCommentTraversalService = ReturnType<typeof Core.resolveDocCommentTraversalService>;

function createLegacyFunctionNode() {
    return {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "legacyFunction" },
        start: 60,
        end: 80
    };
}

function createDeprecatedComment() {
    return { type: "CommentLine", value: "// @deprecated", start: 10, end: 20 };
}

function createTraversal(node: unknown) {
    const comments = [createDeprecatedComment()];
    return {
        forEach(callback: (node: unknown, comments?: unknown[]) => void) {
            callback(node, comments);
        }
    } satisfies DocCommentTraversalService;
}

function collectDeprecatedNames(whitespace: string) {
    const functionNode = createLegacyFunctionNode();
    const traversal = createTraversal(functionNode);

    return Core.collectDeprecatedFunctionNames(
        { type: "Program", body: [functionNode], comments: [] },
        whitespace,
        traversal
    );
}

void test("collectDeprecatedFunctionNames identifies top-level deprecated functions", () => {
    const names = collectDeprecatedNames(" ".repeat(120));
    assert.deepStrictEqual([...names], ["legacyFunction"]);
});

void test("collectDeprecatedFunctionNames ignores functions without whitespace before start", () => {
    const names = collectDeprecatedNames(`${" ".repeat(30)}X${" ".repeat(120)}`);

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

    const found = Core.findDeprecatedDocComment([comment], 30, `${" ".repeat(25)}X${" ".repeat(120)}`);

    assert.strictEqual(found, null);
});
