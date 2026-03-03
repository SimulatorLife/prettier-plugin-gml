/**
 * Enforces the formatter/linter boundary (target-state.md §2.1, §3.2):
 *
 * The format printer's `function-parameter-naming` module must expose only
 * layout helpers — traversal and declarator joining.
 * Semantic content rewrites (parameter renaming, alias removal, argument
 * initializer inference) belong in `@gml-modules/lint`, not the formatter.
 * Parser-workarounds (e.g. `filterMisattachedFunctionDocComments`) must not
 * live in the format workspace; they were correctly removed when the boundary
 * was enforced.
 *
 * These tests guard against the silent re-introduction of dormant semantic
 * transform functions into the format workspace.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as FunctionParameterNaming from "../src/printer/function-parameter-naming.js";

void test("function-parameter-naming module only exposes layout helpers", () => {
    const exports = Object.keys(FunctionParameterNaming).toSorted();

    // `filterMisattachedFunctionDocComments` was a parser-workaround that
    // attempted to compensate for missed doc-comment attachment in the AST.
    // It was correctly removed: compensating for parser gaps is not a formatter
    // responsibility (target-state.md §2.1 — "Format must not synthesize or
    // normalize content"; parser defects are fixed in the parser or lint phase).
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
