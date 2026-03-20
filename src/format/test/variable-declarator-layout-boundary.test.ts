/**
 * Enforces the formatter/linter boundary (target-state.md §2.1, §3.2):
 *
 * The format printer's `variable-declarator-layout` module must expose only
 * doc-layout helpers — declarator joining for `VariableDeclaration` nodes.
 * Path traversal helpers (e.g. `findEnclosingFunctionDeclaration`) belong in
 * `path-utils.ts`; semantic content rewrites (parameter renaming, alias
 * removal, argument initializer inference) belong in `@gmloop/lint`.
 *
 * `filterMisattachedFunctionDocComments` was a parser-workaround that lived
 * in this module but has since been correctly migrated to the parser workspace
 * (`@gmloop/parser` → `normalize-function-doc-comment-attachments.ts`).
 * It must NOT be re-introduced here; the parser now handles function-tag
 * comment pre-attachment before the formatter ever runs.
 *
 * `findEnclosingFunctionDeclaration` was a path-traversal helper that lived
 * here but has been moved to `path-utils.ts`, the canonical module for
 * AstPath utilities, to keep concerns properly separated.
 *
 * These tests guard against the silent re-introduction of dormant semantic
 * transform functions or misplaced path-traversal helpers into this module.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as VariableDeclaratorLayout from "../src/printer/variable-declarator-layout.js";

void test("variable-declarator-layout module only exposes doc-layout helpers", () => {
    const exports = Object.keys(VariableDeclaratorLayout).toSorted();

    // Only the declarator-joining doc-layout helper is permitted in this module.
    // `findEnclosingFunctionDeclaration` was moved to `path-utils.ts` where it
    // belongs alongside other AstPath traversal utilities.
    // `filterMisattachedFunctionDocComments` was removed because it was a
    // parser-workaround; the parser's normalizeFunctionDocCommentAttachments
    // pass now pre-attaches @function-tag comments before the formatter runs.
    assert.deepStrictEqual(
        exports,
        ["joinDeclaratorPartsWithCommas"],
        "variable-declarator-layout must only export doc-layout helpers — path traversal belongs in path-utils.ts, semantic rewrites in @gmloop/lint"
    );
});

void test("variable-declarator-layout does not export semantic parameter renaming (getPreferredFunctionParameterName)", () => {
    assert.ok(
        !("getPreferredFunctionParameterName" in VariableDeclaratorLayout),
        "getPreferredFunctionParameterName is a semantic content rewrite; it must not live in the format workspace (target-state.md §2.1)"
    );
});

void test("variable-declarator-layout does not export redundant-alias filter (filterKeptDeclarators)", () => {
    assert.ok(
        !("filterKeptDeclarators" in VariableDeclaratorLayout),
        "filterKeptDeclarators is a structural content rewrite; it must not live in the format workspace (target-state.md §3.2)"
    );
});

void test("variable-declarator-layout does not export argument-initializer inference (resolveArgumentAliasInitializerDoc)", () => {
    assert.ok(
        !("resolveArgumentAliasInitializerDoc" in VariableDeclaratorLayout),
        "resolveArgumentAliasInitializerDoc is a semantic lookup used for content rewriting; it must not live in the format workspace (target-state.md §3.2)"
    );
});

void test("variable-declarator-layout does not export preferred-name resolver (resolvePreferredParameterName)", () => {
    assert.ok(
        !("resolvePreferredParameterName" in VariableDeclaratorLayout),
        "resolvePreferredParameterName is a semantic content rewrite helper; it must not live in the format workspace"
    );
});

void test("variable-declarator-layout does not export parser-workaround (filterMisattachedFunctionDocComments)", () => {
    // This function was a formatter-side workaround for comments that Prettier
    // attached to the wrong AST node. It has been correctly migrated to the
    // parser workspace: `@gmloop/parser` →
    // `normalize-function-doc-comment-attachments.ts`. The parser's
    // `normalizeFunctionDocCommentAttachments` pass now pre-attaches
    // `@function`-tag comments to their target function node before the
    // formatter ever runs. Re-adding this to the format workspace would
    // violate target-state.md §3.5 ("isolating dormant migrated semantic
    // transform modules from formatter workspace exports").
    assert.ok(
        !("filterMisattachedFunctionDocComments" in VariableDeclaratorLayout),
        "filterMisattachedFunctionDocComments was a parser-workaround and must not be re-introduced to the format workspace (target-state.md §3.5)"
    );
});

void test("variable-declarator-layout does not export path-traversal helper (findEnclosingFunctionDeclaration)", () => {
    // `findEnclosingFunctionDeclaration` is a path traversal utility and has
    // been moved to `path-utils.ts`, the canonical home for AstPath helpers.
    // It must not be re-introduced here to avoid mixing doc-layout and
    // path-traversal concerns in the same module.
    assert.ok(
        !("findEnclosingFunctionDeclaration" in VariableDeclaratorLayout),
        "findEnclosingFunctionDeclaration is a path-traversal helper and belongs in path-utils.ts, not variable-declarator-layout"
    );
});
