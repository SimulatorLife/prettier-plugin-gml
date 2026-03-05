/**
 * Enforces the formatter/linter boundary (target-state.md §2.1, §3.2):
 *
 * The format printer's `function-parameter-naming` module must expose only
 * layout helpers — path traversal and declarator joining.
 * Semantic content rewrites (parameter renaming, alias removal, argument
 * initializer inference) belong in `@gml-modules/lint`, not the formatter.
 *
 * `filterMisattachedFunctionDocComments` was a parser-workaround that lived
 * in this module but has since been correctly migrated to the parser workspace
 * (`@gml-modules/parser` → `normalize-function-doc-comment-attachments.ts`).
 * It must NOT be re-introduced here; the parser now handles function-tag
 * comment pre-attachment before the formatter ever runs.
 *
 * These tests guard against the silent re-introduction of dormant semantic
 * transform functions into the format workspace.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as FunctionParameterNaming from "../src/printer/function-parameter-naming.js";

void test("function-parameter-naming module only exposes layout helpers", () => {
    const exports = Object.keys(FunctionParameterNaming).toSorted();

    // Only pure layout helpers are permitted in this module.
    // `filterMisattachedFunctionDocComments` was removed because it was a
    // parser-workaround; the parser's normalizeFunctionDocCommentAttachments
    // pass now pre-attaches @function-tag comments before the formatter runs.
    assert.deepStrictEqual(
        exports,
        ["findEnclosingFunctionDeclaration", "joinDeclaratorPartsWithCommas"],
        "function-parameter-naming must only export layout helpers — semantic rewrites belong in @gml-modules/lint"
    );
});

void test("function-parameter-naming does not export semantic parameter renaming (getPreferredFunctionParameterName)", () => {
    assert.ok(
        !("getPreferredFunctionParameterName" in FunctionParameterNaming),
        "getPreferredFunctionParameterName is a semantic content rewrite; it must not live in the format workspace (target-state.md §2.1)"
    );
});

void test("function-parameter-naming does not export redundant-alias filter (filterKeptDeclarators)", () => {
    assert.ok(
        !("filterKeptDeclarators" in FunctionParameterNaming),
        "filterKeptDeclarators is a structural content rewrite; it must not live in the format workspace (target-state.md §3.2)"
    );
});

void test("function-parameter-naming does not export argument-initializer inference (resolveArgumentAliasInitializerDoc)", () => {
    assert.ok(
        !("resolveArgumentAliasInitializerDoc" in FunctionParameterNaming),
        "resolveArgumentAliasInitializerDoc is a semantic lookup used for content rewriting; it must not live in the format workspace (target-state.md §3.2)"
    );
});

void test("function-parameter-naming does not export preferred-name resolver (resolvePreferredParameterName)", () => {
    assert.ok(
        !("resolvePreferredParameterName" in FunctionParameterNaming),
        "resolvePreferredParameterName is a semantic content rewrite helper; it must not live in the format workspace"
    );
});

void test("function-parameter-naming does not export parser-workaround (filterMisattachedFunctionDocComments)", () => {
    // This function was a formatter-side workaround for comments that Prettier
    // attached to the wrong AST node. It has been correctly migrated to the
    // parser workspace: `@gml-modules/parser` →
    // `normalize-function-doc-comment-attachments.ts`. The parser's
    // `normalizeFunctionDocCommentAttachments` pass now pre-attaches
    // `@function`-tag comments to their target function node before the
    // formatter ever runs. Re-adding this to the format workspace would
    // violate target-state.md §3.5 ("isolating dormant migrated semantic
    // transform modules from formatter workspace exports").
    assert.ok(
        !("filterMisattachedFunctionDocComments" in FunctionParameterNaming),
        "filterMisattachedFunctionDocComments was a parser-workaround and must not be re-introduced to the format workspace (target-state.md §3.5)"
    );
});
