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

    if (!parseResult.ok) {
        assert.fail(`Expected parse success for test source:\n${code}`);
    }

    return parseResult.ast;
}

function runNoScientificNotationRule(code: string): { messageCount: number; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules["no-scientific-notation"];
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

void test("no-scientific-notation is registered in the lint plugin", () => {
    const rule = LintWorkspace.Lint.plugin.rules["no-scientific-notation"];
    assert.ok(rule, "Expected no-scientific-notation rule to be registered");
});

void test("no-scientific-notation auto-fixes negative-exponent scientific literals", () => {
    const input = "var epsilon = 1e-11;\n";
    const result = runNoScientificNotationRule(input);

    assert.equal(result.messageCount, 1);
    assert.equal(result.output, "var epsilon = 0.00000000001;\n");
});

void test("no-scientific-notation auto-fixes all scientific notation forms in code", () => {
    const input = ["var a = 1e3;", "var b = .5E+2;", "var c = 4.50e-1;"].join("\n");
    const result = runNoScientificNotationRule(`${input}\n`);

    assert.equal(result.messageCount, 3);
    assert.equal(result.output, "var a = 1000;\nvar b = 50;\nvar c = 0.45;\n");
});

void test("no-scientific-notation does not touch scientific notation text in comments and strings", () => {
    const input = [
        'var message = "value: 1e-11";',
        "// 2e-9 should remain in a comment",
        "/* 3E+4 should remain in a block comment */",
        "var stable = 42;"
    ].join("\n");
    const result = runNoScientificNotationRule(`${input}\n`);

    assert.equal(result.messageCount, 0);
    assert.equal(result.output, `${input}\n`);
});

void test("no-scientific-notation is enabled in the recommended config", () => {
    const recommended = LintWorkspace.Lint.configs.recommended;
    const allRules = recommended.flatMap((config) => Object.keys(config.rules ?? {}));
    assert.ok(
        allRules.includes("gml/no-scientific-notation"),
        "Expected gml/no-scientific-notation to be in the recommended config"
    );
});
