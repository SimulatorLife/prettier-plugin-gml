import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";
import { ESLint } from "eslint";

const { Lint } = LintWorkspace;

type TimedLintRunResult = Readonly<{
    elapsedMilliseconds: number;
    ruleMilliseconds: number;
    messages: ReadonlyArray<ESLint.LintResult["messages"][number]>;
    outputText: string;
}>;

function buildNonMathAssignmentBatchSource(statementCount: number): string {
    const lines: string[] = [];
    for (let index = 0; index < statementCount; index += 1) {
        lines.push(`field_${index} = other_${index};`);
    }

    lines.push("");
    return lines.join("\n");
}

function buildNonLogicalConditionBatchSource(statementCount: number): string {
    const lines: string[] = [];
    for (let index = 0; index < statementCount; index += 1) {
        lines.push(`if (value_${index} > 0) {`, `    value_${index} = value_${index};`, "}");
    }

    lines.push("");
    return lines.join("\n");
}

async function lintSingleRuleWithTiming(ruleId: string, sourceText: string): Promise<TimedLintRunResult> {
    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        stats: true,
        overrideConfig: [
            {
                files: ["**/*.gml"],
                plugins: {
                    gml: Lint.plugin
                },
                language: "gml/gml",
                rules: {
                    [ruleId]: "warn"
                }
            }
        ]
    });

    const startedAtNanoseconds = process.hrtime.bigint();
    const [result] = await eslint.lintText(sourceText, {
        filePath: "performance-regression.gml"
    });
    const elapsedMilliseconds = Number(process.hrtime.bigint() - startedAtNanoseconds) / 1e6;

    const passTimings = result.stats?.times?.passes ?? [];
    const ruleMilliseconds = passTimings.reduce((accumulator, passTiming) => {
        return accumulator + (passTiming.rules[ruleId]?.total ?? 0);
    }, 0);

    return Object.freeze({
        elapsedMilliseconds,
        ruleMilliseconds,
        messages: Object.freeze(result.messages),
        outputText: result.output ?? sourceText
    });
}

void test("optimize-math-expressions skips non-math batches without runaway traversal cost", async () => {
    const source = buildNonMathAssignmentBatchSource(1500);
    const timedRun = await lintSingleRuleWithTiming("gml/optimize-math-expressions", source);

    assert.equal(timedRun.messages.length, 0);
    assert.equal(timedRun.outputText, source);
    assert.ok(
        timedRun.ruleMilliseconds < 8000,
        `expected optimize-math-expressions rule runtime under 8000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 10_000,
        `expected total lint runtime under 10000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("optimize-logical-flow skips non-logical batches without deep clone overhead", async () => {
    const source = buildNonLogicalConditionBatchSource(1200);
    const timedRun = await lintSingleRuleWithTiming("gml/optimize-logical-flow", source);

    assert.equal(timedRun.messages.length, 0);
    assert.equal(timedRun.outputText, source);
    assert.ok(
        timedRun.ruleMilliseconds < 5000,
        `expected optimize-logical-flow rule runtime under 5000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 8000,
        `expected total lint runtime under 8000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});
