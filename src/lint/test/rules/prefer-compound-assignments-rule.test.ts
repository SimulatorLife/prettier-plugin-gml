import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { assertEquals } from "../assertions.js";
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

function runPreferCompoundAssignmentsRule(code: string): { messageCount: number; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules["prefer-compound-assignments"];
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

void test("prefer-compound-assignments rewrites subtraction, multiplication, and division self-assignments", () => {
    const input = ["speed = speed * friction;", "lives = lives - 1;", "timer = timer / delta;", ""].join("\n");
    const expected = ["speed *= friction;", "lives -= 1;", "timer /= delta;", ""].join("\n");

    const result = runPreferCompoundAssignmentsRule(input);
    assertEquals(result.messageCount, 3);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments preserves complex right operand text", () => {
    const input = "x = x * (a + b);\n";
    const expected = "x *= (a + b);\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments rewrites x = x ?? y to x ??= y", () => {
    const input = "x = x ?? y;\n";
    const expected = "x ??= y;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments rewrites nullish assignment with call-expression fallback", () => {
    const input = "cache = cache ?? ds_map_create();\n";
    const expected = "cache ??= ds_map_create();\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments rewrites nullish assignment with member fallback", () => {
    const input = "config = config ?? global.default_config;\n";
    const expected = "config ??= global.default_config;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments rewrites parenthesized nullish expressions", () => {
    const input = "value = (value ?? (a + b));\n";
    const expected = "value ??= (a + b);\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 1);
    assertEquals(result.output, expected);
});

void test("prefer-compound-assignments does not rewrite when identifiers differ", () => {
    const input = "x = y - z;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments does not rewrite nullish assignments when identifiers differ", () => {
    const input = "x = y ?? z;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments does not rewrite non-identifier left-hand sides", () => {
    const input = "arr[i] = arr[i] - 1;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments does not rewrite nullish assignments on non-identifier left-hand sides", () => {
    const input = "arr[i] = arr[i] ?? 0;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments does not rewrite when comments exist in the right expression span", () => {
    const input = "lives = lives - /* keep */ 1;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments v1 does not rewrite plus assignments", () => {
    const input = "name = name + suffix;\n";
    const result = runPreferCompoundAssignmentsRule(input);

    assertEquals(result.messageCount, 0);
    assertEquals(result.output, input);
});

void test("prefer-compound-assignments is included in the recommended config", () => {
    const recommended = LintWorkspace.Lint.configs.recommended;
    const allRules = recommended.flatMap((config) => Object.keys(config.rules ?? {}));

    assertEquals(allRules.includes("gml/prefer-compound-assignments"), true);
});
