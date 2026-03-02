/**
 * Enforces the formatter/linter split contract (target-state.md §2.2, §3.2):
 *
 * `normalizeFormattedOutput` is a layout-only post-processing pass. It must
 * not strip or rewrite `@func`/`@function` doc comment tags — that is a
 * semantic/content rewrite owned exclusively by the `@gml-modules/lint`
 * `normalize-doc-comments` rule.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

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

// ─── Tests for the merged normalizeLineBasedTransformations pass ─────────────
// The three transforms that were previously separate passes are now combined into
// one. These tests verify each transform still works correctly in isolation and
// in combination.

void describe("normalizeFormattedOutput – line-based transforms (single-pass)", () => {
    void test("normalizes double-indented single-comment blocks (transform 1)", () => {
        // A lone `//` comment that is double-indented inside a `{ }` block should
        // be reduced to single indentation so it matches the closing `}`.
        // The trigger condition: extra indentation beyond the closing brace is
        // exactly 8 spaces (double the 4-space indent) or exactly 2 tabs.
        const input = ["if (x) {", "        // double-indented comment", "}", ""].join("\n");

        const result = normalizeFormattedOutput(input);

        assert.ok(
            result.includes("    // double-indented comment"),
            `Expected double indent to be normalized to single indent.\nActual:\n${result}`
        );
        assert.ok(
            !result.includes("        // double-indented comment"),
            `Expected original double indent to be removed.\nActual:\n${result}`
        );
    });

    void test("inserts blank line before top-level // comment after non-comment content (transform 2)", () => {
        // A top-level `//` comment must get a blank line when the preceding line
        // is non-empty and not already a top-level comment.
        const input = ["var x = 1;", "// this is a top-level comment", "var y = 2;", ""].join("\n");

        const result = normalizeFormattedOutput(input);

        assert.ok(
            result.includes("var x = 1;\n\n// this is a top-level comment"),
            `Expected blank line inserted before top-level comment.\nActual:\n${result}`
        );
    });

    void test("does not insert blank line before top-level // comment that already has one (transform 2)", () => {
        const input = ["var x = 1;", "", "// already separated", "var y = 2;", ""].join("\n");

        const result = normalizeFormattedOutput(input);
        const doubleBlankCount = (result.match(/\n\n\n/g) ?? []).length;

        assert.equal(doubleBlankCount, 0, `Expected no double-blank lines to be inserted.\nActual:\n${result}`);
    });

    void test("removes blank line before guard comment inside a block (transform 3)", () => {
        // A blank line between an opening `{` and a `//` guard comment followed by
        // an `if` statement should be removed.
        const input = [
            "function check() {",
            "",
            "    // guard comment",
            "    if (condition) {",
            "        return;",
            "    }",
            "}",
            ""
        ].join("\n");

        const result = normalizeFormattedOutput(input);

        assert.ok(
            !result.includes("{\n\n    // guard comment"),
            `Expected blank line before guard comment to be removed.\nActual:\n${result}`
        );
        assert.ok(
            result.includes("{\n    // guard comment"),
            `Expected guard comment to immediately follow opening brace.\nActual:\n${result}`
        );
    });

    void test("does not remove blank before non-guard comment (transform 3 non-regression)", () => {
        // A blank line before a `//` comment that is NOT followed by `if` must be
        // preserved.
        const input = ["function work() {", "", "    // general comment", "    var x = 1;", "}", ""].join("\n");

        const result = normalizeFormattedOutput(input);

        assert.ok(
            result.includes("{\n\n    // general comment"),
            `Expected blank line before non-guard comment to be preserved.\nActual:\n${result}`
        );
    });

    void test("all three transforms fire correctly on a combined input", () => {
        // Exercises all three normalizeLineBasedTransformations transforms in a
        // single document to confirm they compose without interfering.
        const input = [
            "var setup = 1;",
            "// top-level section header",
            "function check() {",
            "",
            "    // guard: validate input",
            "    if (setup) {",
            "        return;",
            "    }",
            "}",
            ""
        ].join("\n");

        const result = normalizeFormattedOutput(input);

        // Transform 2: blank inserted before top-level comment
        assert.ok(
            result.includes("var setup = 1;\n\n// top-level section header"),
            `Transform 2 – expected blank before top-level comment.\nActual:\n${result}`
        );

        // Transform 3: blank before guard comment is removed
        assert.ok(
            result.includes("{\n    // guard: validate input"),
            `Transform 3 – expected blank before guard comment to be removed.\nActual:\n${result}`
        );
    });
});
