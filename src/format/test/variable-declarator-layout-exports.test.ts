/**
 * Enforces the formatter/linter boundary contract (target-state.md §2.2, §3.2):
 *
 * The `variable-declarator-layout` module must only export the doc-layout helper
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

import * as VariableDeclaratorLayout from "../src/printer/variable-declarator-layout.js";

void test("variable-declarator-layout exports only doc-layout helper functions (boundary contract)", () => {
    const exportedNames = Object.keys(VariableDeclaratorLayout).toSorted();

    assert.deepStrictEqual(
        exportedNames,
        ["joinDeclaratorPartsWithCommas"],
        [
            "variable-declarator-layout must only export the declarator-joining doc-layout helper.",
            "Path traversal belongs in path-utils.ts.",
            "Semantic rewrites (parameter renaming, alias filtering) belong in @gmloop/lint.",
            "target-state.md §2.2, §3.2: format workspace must not import @gmloop/lint."
        ].join(" ")
    );
});

void test("variable-declarator-layout does not export semantic-rewrite functions", () => {
    assert.ok(
        !("getPreferredFunctionParameterName" in VariableDeclaratorLayout),
        "getPreferredFunctionParameterName is a semantic rewrite (parameter renaming) and must not be exported from the format workspace"
    );
    assert.ok(
        !("filterKeptDeclarators" in VariableDeclaratorLayout),
        "filterKeptDeclarators is a semantic rewrite (argument alias filtering) and must not be exported from the format workspace"
    );
    assert.ok(
        !("resolveArgumentAliasInitializerDoc" in VariableDeclaratorLayout),
        "resolveArgumentAliasInitializerDoc is a semantic rewrite (argument alias resolution) and must not be exported from the format workspace"
    );
    assert.ok(
        !("resolvePreferredParameterName" in VariableDeclaratorLayout),
        "resolvePreferredParameterName is a semantic rewrite (parameter renaming) and must not be exported from the format workspace"
    );
    assert.ok(
        !("findEnclosingFunctionNode" in VariableDeclaratorLayout),
        "findEnclosingFunctionNode is unused dead code and must not be exported from the format workspace"
    );
    assert.ok(
        !("filterMisattachedFunctionDocComments" in VariableDeclaratorLayout),
        "filterMisattachedFunctionDocComments was a parser-workaround and must not remain in the format workspace"
    );
    assert.ok(
        !("findEnclosingFunctionDeclaration" in VariableDeclaratorLayout),
        "findEnclosingFunctionDeclaration is a path-traversal helper and has been moved to path-utils.ts; it must not be re-introduced here"
    );
});
