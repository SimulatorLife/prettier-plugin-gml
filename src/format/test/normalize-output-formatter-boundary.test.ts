/**
 * Enforces the formatter/linter split contract (target-state.md §2.2, §3.2):
 *
 * `normalizeFormattedOutput` is a layout-only post-processing pass. It must
 * not strip or rewrite `@func`/`@function` doc comment tags — that is a
 * semantic/content rewrite owned exclusively by the `@gml-modules/lint`
 * `normalize-doc-comments` rule.
 *
 * It must also not embed GML-domain knowledge about specific comment strings
 * synthesized by lint rules (e.g. vertex-format diagnostic comments). Spacing
 * decisions that depend on semantic knowledge of particular lint-generated
 * comment text belong in the `@gml-modules/lint` workspace, not the formatter.
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

void test("normalizeFormattedOutput does not alter spacing between GML-domain vertex-format comment strings (lint-domain knowledge must not live in formatter)", () => {
    // The formatter must not embed knowledge of specific lint-generated GML comment
    // strings such as vertex-format diagnostic messages. Spacing decisions based on
    // GML API semantics belong in @gml-modules/lint, not in the formatter's
    // post-processing pipeline. (target-state.md §2.1, §3.2)
    //
    // The previously removed `ensureBlankLineBetweenVertexFormatComments` function
    // also contained a dead-code bug: its KEEP_VERTEX_FORMAT_COMMENT_TEXT constant
    // read "completed within a function call" but the lint gm2012 rule generates
    // "built within a function call", so the pattern never matched in practice.
    // The strings below use the actual lint fixture text to accurately represent
    // the domain comment knowledge the formatter must never embed.
    const emptyVertexFormatComment =
        "// If a vertex format is ended and empty but not assigned, then it does nothing and should be removed";
    const keepVertexFormatComment =
        "// If a vertex format might be built within a function call, then it should be kept";

    // When these two comments appear adjacent (no blank line between them), the
    // formatter must NOT insert a blank line — that is a lint-workspace concern.
    const input = [emptyVertexFormatComment, keepVertexFormatComment, ""].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.strictEqual(
        result,
        input,
        "normalizeFormattedOutput must not insert blank lines between GML-domain diagnostic comment strings — spacing based on lint-generated content belongs in @gml-modules/lint (target-state.md §2.1, §3.2)"
    );
});

void test("normalizeFormattedOutput does not collapse blank lines around vertex_format_begin/vertex_format_end calls (GML-domain knowledge must not live in formatter)", () => {
    // `vertex_format_begin()` and `vertex_format_end()` are GML built-in API
    // functions. Collapsing blank lines between them based on knowledge of these
    // specific function names is a GML-domain-aware semantic rewrite, not a pure
    // layout operation. According to target-state.md §2.1 and §3.2, the formatter
    // must not perform semantic/content rewrites — any spacing rules that rely on
    // knowledge of specific GML API calls belong in the `@gml-modules/lint` workspace.
    //
    // The previously present `collapseVertexFormatBeginSpacing` and
    // `collapseCustomFunctionToFormatEndSpacing` functions violated this contract
    // and have been removed.
    const input = [
        "vertex_format_begin();",
        "",
        "vertex_format_attrib_position();",
        "var fmt = vertex_format_end();",
        ""
    ].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.match(
        result,
        /vertex_format_begin\(\);\n\nvertex_format_attrib_position\(\);/,
        "normalizeFormattedOutput must not collapse blank lines around vertex_format_begin — GML-domain spacing belongs in @gml-modules/lint (target-state.md §2.1, §3.2)"
    );
});
