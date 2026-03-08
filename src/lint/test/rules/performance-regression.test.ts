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

type TimedLintRunOptions = Readonly<{
    filePath?: string;
    getProjectContext?: () => ReturnType<typeof Lint.services.createProjectAnalysisSnapshotFromProjectIndex>;
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

function buildHeavyIfGuardBatchSource(statementCount: number): string {
    const lines: string[] = [];
    for (let index = 0; index < statementCount; index += 1) {
        lines.push(
            `if (is_array(_arg_${index}) && !is_undefined(_arg_${index})) {`,
            `    _sum += array_length(_arg_${index});`,
            `    _flag = _flag || (_sum > ${index});`,
            "    _count += 1;",
            "}"
        );
    }

    lines.push("");
    return lines.join("\n");
}

function buildArithmeticChainBatchSource(statementCount: number): string {
    const lines: string[] = [];
    for (let index = 0; index < statementCount; index += 1) {
        lines.push(`result_${index} = a_${index} * b_${index} + c_${index} * d_${index} + e_${index} * f_${index};`);
    }

    lines.push("");
    return lines.join("\n");
}

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

function buildProjectAwareLoopHoistStressSource(loopCount: number, reservedHoistNameCount: number): string {
    const lines: string[] = ["var cached_value = 0;"];

    for (let index = 1; index <= reservedHoistNameCount; index += 1) {
        lines.push(`var cached_value_${index} = ${index};`);
    }

    lines.push("");

    for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
        lines.push(
            `repeat (count_${loopIndex}) {`,
            `    total_${loopIndex} += (base_${loopIndex} + bias_${loopIndex}) * scale_${loopIndex};`,
            "}"
        );
    }

    lines.push("");
    return lines.join("\n");
}

function createProjectAwareLoopHoistSnapshot(occupiedIdentifierNames: ReadonlyArray<string>) {
    const projectRoot = "/virtual-project";
    const filePath = `${projectRoot}/scripts/performance-regression.gml`;

    return Lint.services.createProjectAnalysisSnapshotFromProjectIndex(
        {
            identifiers: {
                locals: Object.fromEntries(
                    occupiedIdentifierNames.map((identifierName, index) => [
                        `entry_${index}`,
                        {
                            declarations: [{ name: identifierName, filePath }],
                            references: []
                        }
                    ])
                )
            }
        },
        projectRoot,
        {
            excludedDirectories: new Set(
                Lint.services.defaultProjectIndexExcludes.map((directory) => directory.toLowerCase())
            ),
            allowedDirectories: []
        }
    );
}

async function lintSingleRuleWithTiming(
    ruleId: string,
    sourceText: string,
    options: TimedLintRunOptions = {}
): Promise<TimedLintRunResult> {
    const configEntry: {
        files: string[];
        plugins: { gml: typeof Lint.plugin };
        language: "gml/gml";
        rules: Record<string, "warn">;
        settings?: {
            gml: {
                project: {
                    getContext: NonNullable<TimedLintRunOptions["getProjectContext"]>;
                };
            };
        };
    } = {
        files: ["**/*.gml"],
        plugins: {
            gml: Lint.plugin
        },
        language: "gml/gml",
        rules: {
            [ruleId]: "warn"
        }
    };

    if (options.getProjectContext) {
        configEntry.settings = {
            gml: {
                project: {
                    getContext: options.getProjectContext
                }
            }
        };
    }

    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        stats: true,
        overrideConfig: [configEntry]
    });

    const startedAtNanoseconds = process.hrtime.bigint();
    const [result] = await eslint.lintText(sourceText, {
        filePath: options.filePath ?? "performance-regression.gml"
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

void test("optimize-logical-flow avoids deep-cloning large guard bodies that cannot be simplified", async () => {
    const source = buildHeavyIfGuardBatchSource(300);
    const timedRun = await lintSingleRuleWithTiming("gml/optimize-logical-flow", source);

    assert.equal(timedRun.messages.length, 0);
    assert.equal(timedRun.outputText, source);
    assert.ok(
        timedRun.ruleMilliseconds < 7000,
        `expected optimize-logical-flow rule runtime under 7000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 9000,
        `expected total lint runtime under 9000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("optimize-math-expressions scales linearly for long arithmetic assignment batches", async () => {
    const source = buildArithmeticChainBatchSource(250);
    const timedRun = await lintSingleRuleWithTiming("gml/optimize-math-expressions", source);

    assert.equal(timedRun.messages.length, 0);
    assert.ok(
        timedRun.outputText.includes("dot_product_3d"),
        "expected optimize-math-expressions to keep applying arithmetic normalization"
    );
    assert.ok(
        timedRun.ruleMilliseconds < 7000,
        `expected optimize-math-expressions rule runtime under 7000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 9000,
        `expected total lint runtime under 9000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("optimize-math-expressions keeps dot-product auto-fixes within bounded runtime on large batches", async () => {
    const source = buildArithmeticChainBatchSource(1000);
    const timedRun = await lintSingleRuleWithTiming("gml/optimize-math-expressions", source);

    assert.equal(timedRun.messages.length, 0);
    assert.ok(
        timedRun.outputText.includes("dot_product_3d"),
        "expected optimize-math-expressions to keep rewriting product chains to dot_product_3d"
    );
    assert.ok(
        timedRun.ruleMilliseconds < 500,
        `expected optimize-math-expressions rule runtime under 500ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 2000,
        `expected total lint runtime under 2000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("prefer-loop-invariant-expressions avoids repeated subtree analysis on deep invariant loop expressions", async () => {
    const source = buildLoopInvariantStressBatchSource(120, 30);
    const timedRun = await lintSingleRuleWithTiming("gml/prefer-loop-invariant-expressions", source);

    assert.equal(timedRun.messages.length, 0);
    assert.ok(
        timedRun.outputText.includes("var cached_value ="),
        "expected prefer-loop-invariant-expressions to keep hoisting loop-invariant subexpressions"
    );
    assert.ok(
        timedRun.ruleMilliseconds < 3000,
        `expected prefer-loop-invariant-expressions rule runtime under 3000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 6000,
        `expected total lint runtime under 6000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("prefer-loop-invariant-expressions keeps large hoist-name resolution workloads within bounded runtime", async () => {
    const source = buildLoopInvariantStressBatchSource(320, 60);
    const timedRun = await lintSingleRuleWithTiming("gml/prefer-loop-invariant-expressions", source);

    assert.equal(timedRun.messages.length, 0);
    assert.ok(
        timedRun.outputText.includes("var cached_value ="),
        "expected prefer-loop-invariant-expressions to keep hoisting loop-invariant subexpressions"
    );
    assert.ok(
        timedRun.ruleMilliseconds < 2500,
        `expected prefer-loop-invariant-expressions rule runtime under 2500ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 12_000,
        `expected total lint runtime under 12000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});

void test("prefer-loop-invariant-expressions keeps project-aware hoist-name resolution bounded on collision-heavy files", async () => {
    const reservedHoistNameCount = 320;
    const source = buildProjectAwareLoopHoistStressSource(220, reservedHoistNameCount);
    const occupiedIdentifierNames = Array.from({ length: reservedHoistNameCount }, (_value, index) => {
        return index === 0 ? "cached_value" : `cached_value_${index}`;
    });
    const timedRun = await lintSingleRuleWithTiming("gml/prefer-loop-invariant-expressions", source, {
        filePath: "project-aware-performance-regression.gml",
        getProjectContext: () => createProjectAwareLoopHoistSnapshot(occupiedIdentifierNames)
    });

    assert.ok(
        timedRun.outputText.includes("var cached_value_321 ="),
        "expected prefer-loop-invariant-expressions to keep hoisting through project-aware name collisions"
    );
    assert.ok(
        timedRun.ruleMilliseconds < 2500,
        `expected project-aware prefer-loop-invariant-expressions runtime under 2500ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
    );
    assert.ok(
        timedRun.elapsedMilliseconds < 8000,
        `expected total project-aware lint runtime under 8000ms, received ${timedRun.elapsedMilliseconds.toFixed(2)}ms`
    );
});
