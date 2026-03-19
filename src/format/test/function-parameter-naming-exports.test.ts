/**
 * Enforces the formatter/linter boundary contract (target-state.md §2.2, §3.2):
 *
 * The `function-parameter-naming` module must only export the doc-layout helper
 * that is safe for the formatter to own. Semantic/content rewrites — such as
 * renaming `argumentN`-style parameters from `@function` doc tags or filtering
 * redundant argument-alias declarations — belong exclusively in `@gmloop/lint`.
 *
 * Path traversal helpers (e.g. `findEnclosingFunctionDeclaration`) belong in
 * `path-utils.ts`, the canonical home for AstPath utilities.
 *
 * The format workspace must not depend on `@gmloop/lint`. Any import of
 * `Lint` inside `@gmloop/format` is a boundary violation.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as ParameterNaming from "../src/printer/function-parameter-naming.js";

void test("function-parameter-naming exports only doc-layout helper functions (boundary contract)", () => {
    const exportedNames = Object.keys(ParameterNaming).toSorted();

    assert.deepStrictEqual(
        exportedNames,
        ["joinDeclaratorPartsWithCommas"],
        [
            "function-parameter-naming must only export the declarator-joining doc-layout helper.",
            "Path traversal belongs in path-utils.ts.",
            "Semantic rewrites (parameter renaming, alias filtering) belong in @gmloop/lint.",
            "target-state.md §2.2, §3.2: format workspace must not import @gmloop/lint."
        ].join(" ")
    );
});

void test("function-parameter-naming does not export semantic-rewrite functions", () => {
    assert.ok(
        !("getPreferredFunctionParameterName" in ParameterNaming),
        "getPreferredFunctionParameterName is a semantic rewrite (parameter renaming) and must not be exported from the format workspace"
    );
    assert.ok(
        !("filterKeptDeclarators" in ParameterNaming),
        "filterKeptDeclarators is a semantic rewrite (argument alias filtering) and must not be exported from the format workspace"
    );
    assert.ok(
        !("resolveArgumentAliasInitializerDoc" in ParameterNaming),
        "resolveArgumentAliasInitializerDoc is a semantic rewrite (argument alias resolution) and must not be exported from the format workspace"
    );
    assert.ok(
        !("resolvePreferredParameterName" in ParameterNaming),
        "resolvePreferredParameterName is a semantic rewrite (parameter renaming) and must not be exported from the format workspace"
    );
    assert.ok(
        !("findEnclosingFunctionNode" in ParameterNaming),
        "findEnclosingFunctionNode is unused dead code and must not be exported from the format workspace"
    );
    assert.ok(
        !("filterMisattachedFunctionDocComments" in ParameterNaming),
        "filterMisattachedFunctionDocComments was a parser-workaround and must not remain in the format workspace"
    );
    assert.ok(
        !("findEnclosingFunctionDeclaration" in ParameterNaming),
        "findEnclosingFunctionDeclaration is a path-traversal helper and has been moved to path-utils.ts; it must not be re-introduced here"
    );
});
