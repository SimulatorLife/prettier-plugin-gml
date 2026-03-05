import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

function parseProgramNode(code: string): Record<string, unknown> {
    const language = LintWorkspace.Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string; physicalPath: string; bom: boolean },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => { ok: true; ast: Record<string, unknown> } | { ok: false };
    };

    const parseResult = language.parse(
        {
            body: code,
            path: "test.gml",
            physicalPath: "test.gml",
            bom: false
        },
        {
            languageOptions: { recovery: "limited" }
        }
    );

    if (parseResult.ok) {
        return parseResult.ast;
    }

    return { type: "Program", body: [] };
}

function runNoEmptyRegionsRule(code: string): { messageCount: number; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules["no-empty-regions"];
    const fixes: Array<ReplaceTextRangeFixOperation> = [];
    let messageCount = 0;
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
            messageCount += 1;

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
    listeners.Program?.(parseProgramNode(code) as never);

    return {
        messageCount,
        output: applyFixOperations(code, fixes)
    };
}

void test("no-empty-regions removes empty region blocks", () => {
    const input = ["var keep = 1;", "#region Init", "#endregion", "var keep2 = 2;", ""].join("\n");
    const expected = ["var keep = 1;", "var keep2 = 2;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
});

void test("no-empty-regions does not remove regions that contain executable code", () => {
    const input = ["#region Setup", "value = 42;", "#endregion", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 0);
    assert.equal(result.output, input);
});

void test("no-empty-regions does not remove regions that contain comments", () => {
    const input = ["#region Setup", "    // keep this note", "#endregion", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 0);
    assert.equal(result.output, input);
});

void test("no-empty-regions removes multiple empty regions in one file", () => {
    const input = ["#region First", "#endregion", "var keep = 1;", "#region Second", "#endregion", ""].join("\n");
    const expected = ["var keep = 1;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
});

void test("no-empty-regions ignores unmatched region directives", () => {
    const input = ["#endregion", "var keep = 1;", ""].join("\n");

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 0);
    assert.equal(result.output, input);
});

void test("no-empty-regions preserves CRLF line endings when autofixing", () => {
    const input = "var keep = 1;\r\n#region Init\r\n#endregion\r\nvar keep2 = 2;\r\n";
    const expected = "var keep = 1;\r\nvar keep2 = 2;\r\n";

    const result = runNoEmptyRegionsRule(input);
    assert.equal(result.messageCount, 1);
    assert.equal(result.output, expected);
});
