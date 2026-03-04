import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function runNormalizeBannerCommentsRule(code: string): string {
    const rule = LintWorkspace.Lint.plugin.rules["normalize-banner-comments"];
    const fixes: Array<ReplaceTextRangeFixOperation> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            if (!payload.fix) {
                return;
            }

            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };

            const fix = payload.fix(fixer);
            if (fix) {
                fixes.push(fix);
            }
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    return applyFixOperations(code, fixes);
}

void test("normalize-banner-comments canonicalizes decorative slash banner lines", () => {
    const input = [
        "////////////////////////////////////////",
        "//-------------------Move camera-----------------------//",
        "////////////////////////////////////",
        "camUpdateTimer += 1;"
    ].join("\n");

    const output = runNormalizeBannerCommentsRule(input);
    assert.equal(output, ["", "// Move camera", "", "camUpdateTimer += 1;"].join("\n"));
});

void test("normalize-banner-comments converts prefixed banner headings to plain comments", () => {
    const input = ["//////// Banner comment", "var value = 1;"].join("\n");
    const output = runNormalizeBannerCommentsRule(input);
    assert.equal(output, ["// Banner comment", "var value = 1;"].join("\n"));
});

void test("normalize-banner-comments leaves doc-tag comments untouched", () => {
    const input = [
        "// @description Top comment",
        "/// @param value",
        "function demo(value) {",
        "    return value;",
        "}"
    ].join("\n");

    const output = runNormalizeBannerCommentsRule(input);
    assert.equal(output, input);
});

void test("normalize-banner-comments collapses decorative slash banners into attached block comments without extra indentation", () => {
    const input = [
        "function demo() {",
        "    /*",
        "        Block docs",
        "    */",
        "\t/*////////////////////////////////////////////////////",
        "\t        Return an array",
        "\t*/////////////////////////////////////////////////////",
        "\treturn [1, 2, 3];",
        "}",
        ""
    ].join("\n");
    const output = runNormalizeBannerCommentsRule(input);

    assert.equal(
        output,
        [
            "function demo() {",
            "    /*",
            "        Block docs",
            "    */",
            "\t/* Return an array */",
            "\treturn [1, 2, 3];",
            "}",
            ""
        ].join("\n")
    );
});

void test("normalize-banner-comments collapses multiple consecutive decorative banners into a single attached one-line block comment", () => {
    const input = [
        "function demo() {",
        "\t/*////////////////////////////////////////////////////",
        "\t        Block docs",
        "\t*/////////////////////////////////////////////////////",
        "\t/*////////////////////////////////////////////////////",
        "\t        Return an array",
        "\t*/////////////////////////////////////////////////////",
        "\treturn [1, 2, 3];",
        "}",
        ""
    ].join("\n");
    const output = runNormalizeBannerCommentsRule(input);

    assert.equal(
        output,
        ["function demo() {", "\t/* Block docs */", "\t/* Return an array */", "\treturn [1, 2, 3];", "}", ""].join(
            "\n"
        )
    );
});

void test("normalize-banner-comments collapses decorative banners even when surrounded by adjacent block comment blocks", () => {
    const input = [
        "function demo() {",
        "    /*",
        "    Block docs",
        "    */",
        "\t/*////////////////////////////////////////////////////",
        "\t        Return an array",
        "\t*/////////////////////////////////////////////////////",
        "    /*",
        "    Trailing docs",
        "    */",
        "    return [1, 2, 3];",
        "}",
        ""
    ].join("\n");
    const output = runNormalizeBannerCommentsRule(input);

    assert.equal(
        output,
        [
            "function demo() {",
            "    /*",
            "    Block docs",
            "    */",
            "\t/* Return an array */",
            "    /*",
            "    Trailing docs",
            "    */",
            "    return [1, 2, 3];",
            "}",
            ""
        ].join("\n")
    );
});

void test("normalize-banner-comments normalizes method-list triple-slash lines into plain line comments", () => {
    const input = [
        "// Feather disable all",
        "/// .__Destroy()",
        "///",
        "/// .__GetBuffer()",
        "function __Batch() constructor {}",
        ""
    ].join("\n");
    const output = runNormalizeBannerCommentsRule(input);

    assert.equal(
        output,
        [
            "// Feather disable all",
            "// .__Destroy()",
            "// .__GetBuffer()",
            "function __Batch() constructor {}",
            ""
        ].join("\n")
    );
});
