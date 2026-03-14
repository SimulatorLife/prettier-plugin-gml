import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import * as LintWorkspace from "@gmloop/lint";
import { ESLint, type Linter } from "eslint";

const { Lint } = LintWorkspace;
const STILE_FIXTURE_URL = new URL("../../../../parser/test/input/stile.gml", import.meta.url);

type TimedLintRunResult = Readonly<{
    elapsedMilliseconds: number;
    ruleMilliseconds: number;
    messages: ReadonlyArray<ESLint.LintResult["messages"][number]>;
    outputText: string;
}>;

const STILE_OPTIMIZE_MATH_OUTPUT_HASH = "42803788c231317796505783e423d1a02cdae11ac31648925faa6c3c51fa24f7";

function buildLoopInvariantStressBatchSource(loopCount: number, invariantTermsPerLoop: number): string {
    const lines: string[] = [];

    for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
        let invariantExpression = `(a_${loopIndex}_0 + b_${loopIndex}_0)`;
        for (let termIndex = 1; termIndex < invariantTermsPerLoop; termIndex += 1) {
            invariantExpression = `(${invariantExpression} + (a_${loopIndex}_${termIndex} + b_${loopIndex}_${termIndex}))`;
        }

        lines.push(
            `repeat (count_${loopIndex}) {`,
            `    total_${loopIndex} += (${invariantExpression}) + random(3);`,
            "}"
        );
    }

    lines.push("");
    return lines.join("\n");
}

async function lintSingleRuleWithTiming(
    ruleId: string,
    sourceText: string,
    filePath = "optimized-autofix-performance.gml"
): Promise<TimedLintRunResult> {
    const configEntry = {
        files: ["**/*.gml"],
        plugins: {
            gml: Lint.plugin
        },
        language: "gml/gml",
        rules: {
            [ruleId]: "warn"
        }
    } satisfies Linter.Config;

    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        stats: true,
        overrideConfig: [configEntry]
    });

    const startedAtNanoseconds = process.hrtime.bigint();
    const [result] = await eslint.lintText(sourceText, {
        filePath
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

function createOutputHash(outputText: string): string {
    return createHash("sha256").update(outputText).digest("hex");
}

function runSequentialPerformanceTest(name: string, implementation: () => Promise<void>): void {
    void test(name, { concurrency: false }, implementation);
}

runSequentialPerformanceTest(
    "optimize-math-expressions keeps repeated stile rewrites within the cached-normalization budget",
    async () => {
        const source = await readFile(STILE_FIXTURE_URL, "utf8");
        const timedRun = await lintSingleRuleWithTiming("gml/optimize-math-expressions", source, "stile.gml");

        assert.equal(timedRun.messages.length, 0);
        assert.equal(createOutputHash(timedRun.outputText), STILE_OPTIMIZE_MATH_OUTPUT_HASH);
        assert.ok(
            timedRun.ruleMilliseconds < 1000,
            `expected optimize-math-expressions runtime under 1000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
        );
    }
);

runSequentialPerformanceTest(
    "prefer-loop-invariant-expressions prunes deep invariant subtrees within the stress budget",
    async () => {
        const source = buildLoopInvariantStressBatchSource(220, 60);
        const timedRun = await lintSingleRuleWithTiming("gml/prefer-loop-invariant-expressions", source);

        assert.equal(timedRun.messages.length, 0);
        assert.ok(
            timedRun.outputText.includes("var cached_value ="),
            "expected prefer-loop-invariant-expressions to keep hoisting loop-invariant subexpressions"
        );
        assert.ok(
            timedRun.ruleMilliseconds < 2000,
            `expected prefer-loop-invariant-expressions runtime under 2000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
        );
    }
);
