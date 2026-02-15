import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function runNormalizeDocCommentsRule(code: string): string {
    const rule = LintWorkspace.Lint.plugin.rules["normalize-doc-comments"];
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

void test("normalize-doc-comments promotes leading summary lines into @description", () => {
    const input = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}"
    ].join("\n");

    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /\/\/\/ @description Leading summary/);
    assert.match(output, /\/\/\/\s+Additional note/);
    assert.match(output, /\/\/\/ @param value - the input/);
});

void test("normalize-doc-comments removes empty @description lines", () => {
    const input = ["/// @description", "function test() {}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.doesNotMatch(output, /@description\s*$/m);
});

void test("normalize-doc-comments preserves non-empty @description content", () => {
    const input = ["/// @description Initialize the sky background", "var a = 1;"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /@description Initialize the sky background/);
});

void test("normalize-doc-comments canonicalizes legacy // @tag comments", () => {
    const input = ["// @description legacy style", "function demo() {}"].join("\n");
    const output = runNormalizeDocCommentsRule(input);
    assert.match(output, /^\/\/\/ @description legacy style/m);
});
