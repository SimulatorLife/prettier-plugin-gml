/**
 * Enforces the formatter/linter split contract (target-state.md §2.2, §3.2):
 *
 * `normalizeFormattedOutput` is a layout-only post-processing pass. It must
 * not strip or rewrite `@func`/`@function` doc comment tags — that is a
 * semantic/content rewrite owned exclusively by the `@gml-modules/lint`
 * `normalize-doc-comments` rule.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeFormattedOutput } from "../src/printer/normalize-formatted-output.js";

void test("normalizeFormattedOutput preserves @function tags (content rewrites belong in lint)", () => {
    const input = [
        "/// @function update_ground_dist(ray_len)",
        "/// @description Updates ground distance each step",
        "/// @param ray_len {real} The ray length",
        "function update_ground_dist(ray_len) {",
        "    return ray_len;",
        "}",
        ""
    ].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.match(
        result,
        /^\/\/\/ @function update_ground_dist/m,
        "normalizeFormattedOutput must not strip @function tags — that is a lint-workspace responsibility"
    );
});

void test("normalizeFormattedOutput preserves @func tags (content rewrites belong in lint)", () => {
    const input = [
        "/// @func do_thing(x)",
        "/// @description Does the thing",
        "function do_thing(x) {",
        "    return x;",
        "}",
        ""
    ].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.match(
        result,
        /^\/\/\/ @func do_thing/m,
        "normalizeFormattedOutput must not strip @func tags — that is a lint-workspace responsibility"
    );
});

void test("normalizeFormattedOutput does not reorder misplaced @description continuation lines", () => {
    const input = [
        "/// continuation line that appears before the tag",
        "/// @description canonical description",
        "function demo() {}",
        ""
    ].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.equal(
        result,
        input,
        "normalizeFormattedOutput must preserve line order; moving misplaced description continuations is lint-owned normalization"
    );
});
