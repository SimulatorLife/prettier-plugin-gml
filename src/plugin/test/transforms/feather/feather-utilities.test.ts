import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCallExpressionArrayContext, walkAstNodes } from "../../../src/transforms/feather/ast-traversal.js";
import { parseExample } from "../../../src/transforms/feather/parser-bootstrap.js";
import {
    applyRemovedIndexAdjustments,
    preprocessSourceForFeatherFixes
} from "../../../src/transforms/feather/enum-handling.js";

void test("parseExample builds an AST for simple input", () => {
    const ast = parseExample("var a = 1;", {
        getLocations: false,
        simplifyLocations: true
    });

    assert.equal(ast?.type, "Program");
});

void test("resolveCallExpressionArrayContext reports array metadata", () => {
    const callExpression = {
        type: "CallExpression",
        object: { type: "Identifier", name: "example" },
        arguments: []
    } as const;
    const context = resolveCallExpressionArrayContext([callExpression][0], [callExpression], 0);

    assert.ok(context);
    assert.equal(context?.index, 0);
    assert.equal(context?.callExpression, callExpression);
    assert.equal(context?.siblings[0], callExpression);
});

void test("walkAstNodes iterates nested nodes", () => {
    const identifiers: string[] = [];
    const ast = {
        type: "Program",
        body: [
            {
                type: "ExpressionStatement",
                expression: { type: "Identifier", name: "alpha" }
            },
            {
                type: "ExpressionStatement",
                expression: { type: "Identifier", name: "beta" }
            }
        ]
    };

    walkAstNodes(ast, (node) => {
        if (node.type === "Identifier") {
            identifiers.push(node.name as string);
        }
    });

    assert.deepEqual(identifiers, ["alpha", "beta"]);
});

void test("preprocessSourceForFeatherFixes sanitizes enum initializers", () => {
    const { sourceText, indexAdjustments } = preprocessSourceForFeatherFixes('enum Example { value = "1" }');

    assert.equal(sourceText, "enum Example { value = 1 }");
    assert.ok(indexAdjustments);
    assert.ok(Array.isArray(indexAdjustments));
});

void test("applyRemovedIndexAdjustments updates node locations", () => {
    const node = { start: { index: 5 }, end: { index: 10 } };

    applyRemovedIndexAdjustments(node, [{ index: 3, delta: 2 }]);

    assert.equal(node.start.index, 7);
    assert.equal(node.end.index, 12);
});
