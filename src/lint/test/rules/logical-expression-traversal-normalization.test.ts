import assert from "node:assert/strict";
import { test } from "node:test";

import { type MutableGameMakerAstNode } from "@gmloop/core";

import { applyLogicalNormalizationWithChangeMetadata } from "../../src/rules/gml/transforms/logical-expression-traversal-normalization.js";

type MutableRecord = Record<string, unknown>;

void test("logical normalization traverses array entries from a stable snapshot when siblings mutate the list", () => {
    const doubleNegationNode: MutableRecord = {
        type: "UnaryExpression",
        operator: "!",
        argument: {
            type: "UnaryExpression",
            operator: "!",
            argument: {
                type: "Identifier",
                name: "flag"
            }
        }
    };

    const body: Array<MutableRecord> = [];

    const mutatingNode: MutableRecord = {
        type: "SyntheticMutationNode",
        get trigger(): null {
            body.splice(0, 1);
            return null;
        }
    };

    body.push(mutatingNode, doubleNegationNode);

    const ast: MutableGameMakerAstNode = {
        type: "Program",
        body
    } as MutableGameMakerAstNode;

    const result = applyLogicalNormalizationWithChangeMetadata(ast);

    assert.equal(result.changed, true);
    assert.equal(Array.isArray(ast.body), true);

    const normalizedBody = ast.body as Array<MutableRecord>;
    assert.equal(normalizedBody.length, 1);
    assert.equal(normalizedBody[0]?.type, "Identifier");
    assert.equal((normalizedBody[0] as { name?: string }).name, "flag");
});
