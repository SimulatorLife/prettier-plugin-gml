/**
 * Enforces the formatter/linter boundary for `function-parameter-naming.ts`
 * (target-state.md §3.2):
 *
 * The module must export only layout-utility functions — no semantic or
 * content-rewrite helpers (e.g., resolving preferred parameter names from
 * doc-comment metadata, filtering redundant argument-alias declarators).
 * Those operations belong exclusively in `@gml-modules/lint`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as FunctionNaming from "../src/printer/function-parameter-naming.js";

void describe("function-parameter-naming module boundary (target-state §3.2)", () => {
    void it("exports only layout-utility functions — no semantic rewrite helpers", () => {
        const exported = Object.keys(FunctionNaming);

        const allowedExports = new Set([
            "findEnclosingFunctionDeclaration",
            "filterMisattachedFunctionDocComments",
            "joinDeclaratorPartsWithCommas"
        ]);

        const unexpectedExports = exported.filter((name) => !allowedExports.has(name));

        assert.deepStrictEqual(
            unexpectedExports,
            [],
            `function-parameter-naming must not export semantic helpers; unexpected exports: ${unexpectedExports.join(", ")}`
        );
    });

    void it("does not export getPreferredFunctionParameterName (semantic content rewrite belongs in lint)", () => {
        assert.ok(
            !("getPreferredFunctionParameterName" in FunctionNaming),
            "getPreferredFunctionParameterName must not be exported from the format workspace"
        );
    });

    void it("does not export filterKeptDeclarators (argument-alias filtering belongs in lint)", () => {
        assert.ok(
            !("filterKeptDeclarators" in FunctionNaming),
            "filterKeptDeclarators must not be exported from the format workspace"
        );
    });

    void it("does not export resolveArgumentAliasInitializerDoc (argument-alias resolution belongs in lint)", () => {
        assert.ok(
            !("resolveArgumentAliasInitializerDoc" in FunctionNaming),
            "resolveArgumentAliasInitializerDoc must not be exported from the format workspace"
        );
    });

    void it("does not export findEnclosingFunctionNode (unused traversal helper)", () => {
        assert.ok(
            !("findEnclosingFunctionNode" in FunctionNaming),
            "findEnclosingFunctionNode must not be exported from the format workspace"
        );
    });

    void it("does not export resolvePreferredParameterName (semantic content rewrite belongs in lint)", () => {
        assert.ok(
            !("resolvePreferredParameterName" in FunctionNaming),
            "resolvePreferredParameterName must not be exported from the format workspace"
        );
    });

    void it("filterMisattachedFunctionDocComments is a layout-only function (marks printed, does not synthesize)", () => {
        const mockDeclarator = {
            comments: [
                { value: " @function draw(x, y)", printed: false },
                { value: " regular comment", printed: false }
            ]
        };

        FunctionNaming.filterMisattachedFunctionDocComments(mockDeclarator);

        // @function comment is marked printed and removed (layout suppression, not content rewrite)
        assert.strictEqual(mockDeclarator.comments.length, 1);
        assert.strictEqual(mockDeclarator.comments[0].value, " regular comment");
    });

    void it("joinDeclaratorPartsWithCommas inserts commas between parts", () => {
        const parts = ["a", "b", "c"];
        const result = FunctionNaming.joinDeclaratorPartsWithCommas(parts);
        assert.deepStrictEqual(result, ["a", ", ", "b", ", ", "c"]);
    });

    void it("joinDeclaratorPartsWithCommas handles empty array", () => {
        const result = FunctionNaming.joinDeclaratorPartsWithCommas([]);
        assert.deepStrictEqual(result, []);
    });

    void it("joinDeclaratorPartsWithCommas handles single element", () => {
        const result = FunctionNaming.joinDeclaratorPartsWithCommas(["only"]);
        assert.deepStrictEqual(result, ["only"]);
    });
});
