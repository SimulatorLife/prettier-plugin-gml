/**
 * Architectural boundary test for `function-parameter-naming`.
 *
 * Enforces that the formatter's parameter-naming module exposes only
 * layout-adjacent helpers and does not leak lint-owned semantic rewrites
 * (parameter renaming, alias omission, argument-alias initializer resolution).
 *
 * See `docs/target-state.md §2.1` for the formatter/linter boundary contract.
 */

import assert from "node:assert/strict";
import test from "node:test";

import * as FunctionParamNaming from "../src/printer/function-parameter-naming.js";

void test("function-parameter-naming exports only the three layout helpers", () => {
    const exported = Object.keys(FunctionParamNaming);

    assert.deepStrictEqual(
        exported.sort(),
        [
            "filterMisattachedFunctionDocComments",
            "findEnclosingFunctionDeclaration",
            "joinDeclaratorPartsWithCommas"
        ].sort(),
        "function-parameter-naming must export exactly the three layout-adjacent helpers; " +
            "semantic renaming exports (getPreferredFunctionParameterName, filterKeptDeclarators, " +
            "resolveArgumentAliasInitializerDoc, resolvePreferredParameterName) must not be present " +
            "– they belong in @gml-modules/lint"
    );
});

void test("filterMisattachedFunctionDocComments removes @function-tagged comments", () => {
    const declarator = {
        comments: [
            { value: "/// @function myFunc(arg)" },
            { value: "/// @func helper()" },
            { value: "/// a regular comment" }
        ]
    };

    FunctionParamNaming.filterMisattachedFunctionDocComments(declarator);

    assert.deepStrictEqual(
        declarator.comments,
        [{ value: "/// a regular comment" }],
        "should keep only non-function-tagged comments"
    );
});

void test("filterMisattachedFunctionDocComments deletes empty comments array", () => {
    const declarator = {
        comments: [{ value: "/// @function foo()" }]
    };

    FunctionParamNaming.filterMisattachedFunctionDocComments(declarator);

    assert.ok(!("comments" in declarator), "comments property should be deleted when all comments are filtered out");
});

void test("filterMisattachedFunctionDocComments marks filtered comments as printed", () => {
    const comment = { value: "/// @func bar()" };
    const declarator = { comments: [comment] };

    FunctionParamNaming.filterMisattachedFunctionDocComments(declarator);

    assert.equal((comment as { printed?: boolean }).printed, true, "filtered comment should be marked as printed");
});

void test("joinDeclaratorPartsWithCommas inserts commas between parts", () => {
    const result = FunctionParamNaming.joinDeclaratorPartsWithCommas(["a", "b", "c"]);
    assert.deepStrictEqual(result, ["a", ", ", "b", ", ", "c"]);
});

void test("joinDeclaratorPartsWithCommas handles single-element array", () => {
    const result = FunctionParamNaming.joinDeclaratorPartsWithCommas(["x"]);
    assert.deepStrictEqual(result, ["x"]);
});

void test("joinDeclaratorPartsWithCommas handles empty array", () => {
    const result = FunctionParamNaming.joinDeclaratorPartsWithCommas([]);
    assert.deepStrictEqual(result, []);
});
