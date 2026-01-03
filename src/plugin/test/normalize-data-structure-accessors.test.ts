/**
 * Tests for data structure accessor normalization.
 *
 * This transform corrects accessor operators when variable names suggest the wrong operator is being used.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDataStructureAccessorsTransform } from "../src/transforms/normalize-data-structure-accessors.js";
import { Parser } from "@gml-modules/parser";

/**
 * Helper function to find a MemberIndexExpression node in an AST.
 */
function findMemberIndexExpression(node: unknown): unknown {
    if (!node || typeof node !== "object") {
        return null;
    }
    if ((node as { type?: string }).type === "MemberIndexExpression") {
        return node;
    }
    for (const value of Object.values(node)) {
        const found = findMemberIndexExpression(value);
        if (found) {
            return found;
        }
    }
    return null;
}

void describe("normalize-data-structure-accessors", () => {
    void it("normalizes [? to [| for list variables", () => {
        const source = "var item = lst_items[? 0];";
        const ast = Parser.GMLParser.parse(source);

        normalizeDataStructureAccessorsTransform.transform(ast);

        const memberNode = findMemberIndexExpression(ast) as {
            accessor?: string;
        } | null;
        assert.ok(memberNode, "Should find MemberIndexExpression");
        assert.strictEqual(memberNode.accessor, "[|", "Should normalize [? to [| for list variable");
    });

    void it("normalizes [| to [? for map variables", () => {
        const source = "var value = my_map[| 'key'];";
        const ast = Parser.GMLParser.parse(source);

        normalizeDataStructureAccessorsTransform.transform(ast);

        const memberNode = findMemberIndexExpression(ast) as {
            accessor?: string;
        } | null;
        assert.ok(memberNode, "Should find MemberIndexExpression");
        assert.strictEqual(memberNode.accessor, "[?", "Should normalize [| to [? for map variable");
    });

    void it("preserves correct accessor for list variables", () => {
        const source = "var item = my_list[| 0];";
        const ast = Parser.GMLParser.parse(source);

        normalizeDataStructureAccessorsTransform.transform(ast);

        const memberNode = findMemberIndexExpression(ast) as {
            accessor?: string;
        } | null;
        assert.ok(memberNode, "Should find MemberIndexExpression");
        assert.strictEqual(memberNode.accessor, "[|", "Should preserve [| for list variable");
    });

    void it("does not modify accessor for non-data-structure variables", () => {
        const source = "var item = some_var[? 0];";
        const ast = Parser.GMLParser.parse(source);

        normalizeDataStructureAccessorsTransform.transform(ast);

        const memberNode = findMemberIndexExpression(ast) as {
            accessor?: string;
        } | null;
        assert.ok(memberNode, "Should find MemberIndexExpression");
        assert.strictEqual(memberNode.accessor, "[?", "Should not modify accessor for non-data-structure variable");
    });

    void it("can be disabled via options", () => {
        const source = "var item = lst_items[? 0];";
        const ast = Parser.GMLParser.parse(source);

        normalizeDataStructureAccessorsTransform.transform(ast, {
            enabled: false
        });

        const memberNode = findMemberIndexExpression(ast) as {
            accessor?: string;
        } | null;
        assert.ok(memberNode, "Should find MemberIndexExpression");
        assert.strictEqual(memberNode.accessor, "[?", "Should not modify when disabled");
    });
});
