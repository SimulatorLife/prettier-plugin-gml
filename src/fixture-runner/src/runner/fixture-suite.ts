import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, test } from "node:test";

import { Core } from "@gmloop/core";

import { discoverFixtureCases } from "../discovery/index.js";
import { collectBudgetFailures, createProfileCollector, createStageTimer } from "../profiling/index.js";
import type {
    FixtureAdapter,
    FixtureCase,
    FixtureCaseExecutionResult,
    FixtureCaseResult,
    FixtureComparison,
    FixtureProfileCollector,
    FixtureRunFailure,
    FixtureRunResult
} from "../types.js";

async function snapshotDirectoryTree(rootPath: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    async function walk(currentPath: string): Promise<void> {
        const entries = await readdir(currentPath, { withFileTypes: true });
        await Promise.all(
            entries.map(async (entry) => {
                const entryPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    await walk(entryPath);
                    return;
                }

                if (!entry.isFile()) {
                    return;
                }

                const relativePath = path.relative(rootPath, entryPath).split(path.sep).join("/");
                files.set(relativePath, await readFile(entryPath, "utf8"));
            })
        );
    }

    await walk(rootPath);
    return files;
}

const DOC_COMMENT_PATTERN = /^\s*\/\/\/\s*(?:\/\s*)?@/iu;

function removeDocCommentAnnotationLines(text: string): string {
    return text
        .split(/\r?\n/u)
        .filter((line) => !DOC_COMMENT_PATTERN.test(line))
        .join("\n");
}

function canonicalizeFixtureText(text: string, comparison: FixtureComparison): string {
    if (comparison === "trimmed-strip-doc-comment-annotations") {
        return removeDocCommentAnnotationLines(text).trim();
    }

    if (comparison === "ignore-whitespace-and-line-endings") {
        return text.replaceAll(/\r\n?/gu, "\n").replaceAll(/\s+/gu, "");
    }

    return text;
}

async function compareFixtureCaseResult(fixtureCase: FixtureCase, caseResult: FixtureCaseResult): Promise<void> {
    if (fixtureCase.assertion === "parse-error") {
        throw new Error(`Fixture ${fixtureCase.caseId} expected a parse error but completed successfully.`);
    }

    if (fixtureCase.assertion === "project-tree") {
        assert.equal(
            caseResult.resultKind,
            "project-tree",
            `Fixture ${fixtureCase.caseId} must return a project-tree result.`
        );
        assert.notEqual(
            fixtureCase.expectedDirectoryPath,
            null,
            `Fixture ${fixtureCase.caseId} is missing expected/ directory.`
        );
        const [actualFiles, expectedFiles] = await Promise.all([
            snapshotDirectoryTree(caseResult.outputDirectoryPath),
            snapshotDirectoryTree(fixtureCase.expectedDirectoryPath)
        ]);
        assert.deepEqual(
            [...actualFiles.entries()],
            [...expectedFiles.entries()],
            `${fixtureCase.caseId} project tree output must match expected tree byte-for-byte.`
        );
        return;
    }

    assert.equal(caseResult.resultKind, "text", `Fixture ${fixtureCase.caseId} must return a text result.`);
    const expectedText =
        fixtureCase.assertion === "idempotent"
            ? await readFile(fixtureCase.inputFilePath ?? "", "utf8")
            : await readFile(fixtureCase.expectedFilePath ?? "", "utf8");
    const actualOutput = canonicalizeFixtureText(caseResult.outputText, fixtureCase.comparison);
    const canonicalExpected = canonicalizeFixtureText(expectedText, fixtureCase.comparison);

    assert.equal(
        actualOutput,
        canonicalExpected,
        fixtureCase.comparison === "exact"
            ? `${fixtureCase.caseId} output must match expected text byte-for-byte.`
            : `${fixtureCase.caseId} output must match expected text for comparison mode ${fixtureCase.comparison}.`
    );
}

async function executeFixtureCase(
    adapter: FixtureAdapter,
    fixtureCase: FixtureCase,
    profileCollector: FixtureProfileCollector
): Promise<FixtureCaseExecutionResult> {
    const stageTimer = createStageTimer();
    const budgets = fixtureCase.config.fixture.profile?.budgets ?? null;
    const deepCpuProfileArtifactPath = null;
    let workingProjectDirectoryPath: string | null = null;
    let caseResult: FixtureCaseResult | null = null;
    let changed = false;

    try {
        await stageTimer.runStage("load", async () => {
            if (fixtureCase.projectDirectoryPath) {
                workingProjectDirectoryPath = await mkdtemp(path.join(os.tmpdir(), "gmloop-fixture-runner-"));
                await cp(fixtureCase.projectDirectoryPath, workingProjectDirectoryPath, { recursive: true });
            }
        });

        await stageTimer.runStage("total", async () => {
            if (fixtureCase.assertion === "parse-error") {
                await assert.rejects(
                    adapter.run({
                        fixtureCase,
                        config: fixtureCase.config,
                        inputText: fixtureCase.inputFilePath ? await readFile(fixtureCase.inputFilePath, "utf8") : null,
                        workingProjectDirectoryPath,
                        runProfiledStage: (stageName, operation) => stageTimer.runStage(stageName, operation)
                    })
                );
                return;
            }

            caseResult = await adapter.run({
                fixtureCase,
                config: fixtureCase.config,
                inputText: fixtureCase.inputFilePath ? await readFile(fixtureCase.inputFilePath, "utf8") : null,
                workingProjectDirectoryPath,
                runProfiledStage: (stageName, operation) => stageTimer.runStage(stageName, operation)
            });
            changed = caseResult.changed;
            await stageTimer.runStage("compare", async () => {
                await compareFixtureCaseResult(fixtureCase, caseResult);
            });
        });

        const stages = stageTimer.getStages();
        const budgetFailures = collectBudgetFailures(stages, budgets);
        const profileEntry = Object.freeze({
            workspace: adapter.workspaceName,
            suite: adapter.suiteName,
            caseId: fixtureCase.caseId,
            fixturePath: fixtureCase.fixturePath,
            status: "passed" as const,
            changed,
            totalMs: stages.find((stage) => stage.stageName === "total")?.durationMs ?? 0,
            stages,
            budgets,
            budgetFailures,
            deepCpuProfileArtifactPath
        });

        if (budgetFailures.length > 0) {
            throw new Error(
                `Fixture ${fixtureCase.caseId} exceeded profiling budgets:\n${budgetFailures
                    .map(
                        (failure) =>
                            `- ${failure.metricName} on ${failure.stageName}: ${failure.actual} > ${failure.budget}`
                    )
                    .join("\n")}`
            );
        }

        profileCollector.addEntry(profileEntry);

        return {
            fixtureCase,
            profileEntry,
            caseResult
        };
    } catch (error) {
        const stages = stageTimer.getStages();
        const budgetFailures = collectBudgetFailures(stages, budgets);
        const profileEntry = Object.freeze({
            workspace: adapter.workspaceName,
            suite: adapter.suiteName,
            caseId: fixtureCase.caseId,
            fixturePath: fixtureCase.fixturePath,
            status: "failed" as const,
            changed,
            totalMs: stages.find((stage) => stage.stageName === "total")?.durationMs ?? 0,
            stages,
            budgets,
            budgetFailures,
            deepCpuProfileArtifactPath
        });
        profileCollector.addEntry(profileEntry);
        throw error;
    } finally {
        if (workingProjectDirectoryPath !== null) {
            await rm(workingProjectDirectoryPath, { recursive: true, force: true });
        }
    }
}

/**
 * Run all fixture cases for a given adapter without registering Node test cases.
 *
 * @param parameters Fixture root, adapter, and optional collector.
 * @returns Executed fixture cases and their results.
 */
export async function runFixtureSuite(parameters: {
    fixtureRoot: string;
    adapter: FixtureAdapter;
    profileCollector?: FixtureProfileCollector;
    continueOnFailure?: boolean;
    caseIds?: ReadonlyArray<string>;
}): Promise<FixtureRunResult> {
    const discoveredFixtureCases = await discoverFixtureCases(parameters.fixtureRoot);
    const caseIdFilter = parameters.caseIds ? new Set(parameters.caseIds) : null;
    const fixtureCases = caseIdFilter
        ? discoveredFixtureCases.filter((fixtureCase) => caseIdFilter.has(fixtureCase.caseId))
        : discoveredFixtureCases;
    const profileCollector = parameters.profileCollector ?? createProfileCollector();
    const executionResults: Array<FixtureCaseExecutionResult> = [];
    const failures: Array<FixtureRunFailure> = [];

    await Core.runSequentially(fixtureCases, async (fixtureCase) => {
        if (!parameters.adapter.supports(fixtureCase.kind)) {
            throw new Error(
                `${parameters.adapter.workspaceName} adapter does not support fixture kind ${fixtureCase.kind}.`
            );
        }

        try {
            executionResults.push(await executeFixtureCase(parameters.adapter, fixtureCase, profileCollector));
        } catch (error) {
            if (!parameters.continueOnFailure) {
                throw error;
            }

            failures.push(
                Object.freeze({
                    fixtureCase,
                    error
                })
            );
        }
    });

    if (failures.length > 0 && !parameters.continueOnFailure) {
        throw failures[0]?.error;
    }

    return Object.freeze({
        fixtureCases,
        executionResults: Object.freeze(executionResults),
        failures: Object.freeze(failures)
    });
}

/**
 * Register a Node test suite backed by shared fixture discovery and execution.
 *
 * @param parameters Fixture root and owning workspace adapter.
 */
export async function registerNodeFixtureSuite(parameters: {
    fixtureRoot: string;
    adapter: FixtureAdapter;
}): Promise<ReadonlyArray<FixtureCase>> {
    const fixtureCases = await discoverFixtureCases(parameters.fixtureRoot);

    void test(`${parameters.adapter.suiteName} discovers fixture cases`, () => {
        assert.equal(
            fixtureCases.length > 0,
            true,
            `Expected at least one fixture for ${parameters.adapter.suiteName}.`
        );
    });

    void describe(parameters.adapter.suiteName, () => {
        for (const fixtureCase of fixtureCases) {
            void it(`${parameters.adapter.workspaceName} fixture ${fixtureCase.caseId}`, async () => {
                await executeFixtureCase(parameters.adapter, fixtureCase, createProfileCollector());
            });
        }
    });

    return Object.freeze(fixtureCases);
}
