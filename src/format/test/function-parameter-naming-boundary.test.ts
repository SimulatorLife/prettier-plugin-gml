/**
 * Enforces the formatter/linter split contract (target-state.md §2.2, §3.2):
 *
 * `function-parameter-naming` is a layout-only printer helper. It must not
 * export semantic content-rewrite functions — those belong exclusively in
 * `@gml-modules/lint`.  This test guards the public export surface so that
 * dormant rewrite exports cannot silently re-appear.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as ParameterNaming from "../src/printer/function-parameter-naming.js";

void describe("function-parameter-naming printer module export boundary", () => {
    void it("does not export getPreferredFunctionParameterName (semantic rewrite — belongs in lint)", () => {
        assert.ok(
            !("getPreferredFunctionParameterName" in ParameterNaming),
            "getPreferredFunctionParameterName is a semantic/content rewrite and must not be exported from the format workspace"
        );
    });

    void it("does not export filterKeptDeclarators (semantic rewrite — belongs in lint)", () => {
        assert.ok(
            !("filterKeptDeclarators" in ParameterNaming),
            "filterKeptDeclarators is a semantic/content rewrite and must not be exported from the format workspace"
        );
    });

    void it("does not export resolveArgumentAliasInitializerDoc (semantic rewrite — belongs in lint)", () => {
        assert.ok(
            !("resolveArgumentAliasInitializerDoc" in ParameterNaming),
            "resolveArgumentAliasInitializerDoc is a semantic/content rewrite and must not be exported from the format workspace"
        );
    });

    void it("does not export resolvePreferredParameterName (semantic rewrite — belongs in lint)", () => {
        assert.ok(
            !("resolvePreferredParameterName" in ParameterNaming),
            "resolvePreferredParameterName is a semantic/content rewrite and must not be exported from the format workspace"
        );
    });

    void it("does not export findEnclosingFunctionNode (dormant lint-coupled traversal helper)", () => {
        assert.ok(
            !("findEnclosingFunctionNode" in ParameterNaming),
            "findEnclosingFunctionNode was coupled to lint internals and must not be exported from the format workspace"
        );
    });

    void it("exports only the three layout-facing printer helpers", () => {
        const expectedExports = new Set([
            "filterMisattachedFunctionDocComments",
            "joinDeclaratorPartsWithCommas",
            "findEnclosingFunctionDeclaration"
        ]);

        for (const key of Object.keys(ParameterNaming)) {
            assert.ok(
                expectedExports.has(key),
                `Unexpected export '${key}' found in function-parameter-naming — only layout helpers are permitted; semantic rewrites belong in @gml-modules/lint`
            );
        }

        for (const expected of expectedExports) {
            assert.ok(
                expected in ParameterNaming,
                `Expected layout helper '${expected}' is missing from function-parameter-naming exports`
            );
        }
    });
});
