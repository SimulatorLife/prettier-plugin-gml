/**
 * Enforces the formatter/linter split contract (target-state.md §2.2, §3.2):
 *
 * `normalizeFormattedOutput` is a layout-only post-processing pass. It must
 * not strip or rewrite `@func`/`@function` doc comment tags — that is a
 * semantic/content rewrite owned exclusively by the `@gmloop/lint`
 * `normalize-doc-comments` rule.
 *
 * It must also not embed GML-domain knowledge about specific GML API names
 * (e.g. `vertex_format_begin`, `vertex_format_end`) or comment strings
 * synthesized by lint rules (e.g. vertex-format diagnostic comments). Spacing
 * decisions that depend on semantic knowledge of particular GML API calls or
 * lint-generated comment text belong in the `@gmloop/lint` workspace, not
 * the formatter.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    ensureBlankLineBeforeTopLevelDecorativeBlockComments,
    ensureBlankLineBeforeTopLevelSlashOnlyBanners,
    normalizeFormattedOutput
} from "../src/printer/normalize-formatted-output.js";

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
    // GML API semantics belong in @gmloop/lint, not in the formatter's
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
        "normalizeFormattedOutput must not insert blank lines between GML-domain diagnostic comment strings — spacing based on lint-generated content belongs in @gmloop/lint (target-state.md §2.1, §3.2)"
    );
});

void test("normalizeFormattedOutput does not collapse blank lines around vertex_format_begin() calls (GML API knowledge belongs in lint, not formatter)", () => {
    // The formatter must not hardcode knowledge of specific GML API function names
    // such as vertex_format_begin() and vertex_format_end(). Collapsing blank lines
    // based on the identity of surrounding GML API calls is a semantic/content
    // rewrite that belongs in @gmloop/lint, not the formatter's post-processing
    // pipeline. (target-state.md §2.1, §3.2)
    //
    // The previously removed `collapseVertexFormatBeginSpacing` and
    // `collapseCustomFunctionToFormatEndSpacing` functions violated this contract by
    // recognising vertex_format_begin() and vertex_format_end() by name and
    // collapsing the blank lines between them and adjacent function calls.
    const input = [
        "vertex_format_begin();",
        "",
        "scr_custom_function();",
        "",
        "format = vertex_format_end();",
        ""
    ].join("\n");

    const result = normalizeFormattedOutput(input);

    assert.strictEqual(
        result,
        input,
        "normalizeFormattedOutput must not collapse blank lines around vertex_format_begin/end — that is GML API domain knowledge belonging in @gmloop/lint (target-state.md §2.1, §3.2)"
    );
});

// ---------------------------------------------------------------------------
// Deterministic banner blank-line rules (removed from source-aware patching)
// ---------------------------------------------------------------------------

void test("ensureBlankLineBeforeTopLevelDecorativeBlockComments inserts blank line before slash-asterisk banner preceded by code", () => {
    // Replacing the legacy preserveBannerSpacingGaps source-aware check:
    // the rule must fire unconditionally when a decorative block comment
    // opener (slash-asterisk + 20+ slashes) is not preceded by a blank line.
    const input = [
        "}",
        "/*////////////////////////////////////////////////////////////////",
        "content line",
        "*/////////////////////////////////////////////////////////////////",
        ""
    ].join("\n");

    const result = ensureBlankLineBeforeTopLevelDecorativeBlockComments(input);

    assert.ok(
        result.includes("}\n\n/*"),
        `Expected a blank line inserted between '}' and the decorative block comment opener.\nActual:\n${result}`
    );
});

void test("ensureBlankLineBeforeTopLevelDecorativeBlockComments is idempotent when blank line already exists", () => {
    const input = [
        "}",
        "",
        "/*////////////////////////////////////////////////////////////////",
        "content line",
        "*/////////////////////////////////////////////////////////////////",
        ""
    ].join("\n");

    const result = ensureBlankLineBeforeTopLevelDecorativeBlockComments(input);

    assert.ok(
        !result.includes("}\n\n\n/*"),
        `Expected no duplicate blank lines — the rule must be idempotent.\nActual:\n${result}`
    );
    assert.ok(result.includes("}\n\n/*"), `Expected exactly one blank line.\nActual:\n${result}`);
});

void test("ensureBlankLineBeforeTopLevelSlashOnlyBanners inserts blank line before pure-slash banner preceded by code", () => {
    // Replacing the legacy preserveBannerSpacingGaps camera-banner check:
    // a line consisting solely of 21+ slashes that follows code must be
    // preceded by a blank line unconditionally.
    const input = [
        'var message = "ready";',
        "////////////////////////////////////////",
        "//---camera---//",
        "////////////////////////////////////",
        ""
    ].join("\n");

    const result = ensureBlankLineBeforeTopLevelSlashOnlyBanners(input);

    assert.ok(
        result.includes('"ready";\n\n//'),
        `Expected a blank line inserted before the slash-only banner.\nActual:\n${result}`
    );
});

void test("ensureBlankLineBeforeTopLevelSlashOnlyBanners does NOT insert blank line between a banner triplet (closing slash-only line follows a label comment)", () => {
    // The closing slash-only line of a camera banner triplet is preceded by
    // a //--- label line (which IS a top-level line comment). The rule must
    // NOT insert a blank line between the label and the closing slash-only line.
    const input = [
        "var x = 1;",
        "////////////////////////////////////////",
        "//---camera section---//",
        "////////////////////////////////////",
        "moreCode();",
        ""
    ].join("\n");

    const result = ensureBlankLineBeforeTopLevelSlashOnlyBanners(input);

    assert.ok(
        !result.includes("//---camera section---//\n\n////"),
        `Expected NO blank line between the label comment and the closing slash-only line.\nActual:\n${result}`
    );
});
