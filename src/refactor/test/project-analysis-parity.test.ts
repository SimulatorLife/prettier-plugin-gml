import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Refactor, type RefactorProjectAnalysisProvider } from "../index.js";

type ParityScenarioReport = {
    occupancy: Record<string, boolean>;
    occurrenceFiles: Record<string, Array<string>>;
    renamePlanning: Array<{
        identifierName: string;
        preferredReplacementName: string;
        safe: boolean;
        reason: string | null;
    }>;
    loopHoistResolution: string | null;
    globalVarSafety: Record<string, boolean>;
};

type LintSnapshotLike = {
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
    planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
    ): ReadonlyArray<{
        identifierName: string;
        preferredReplacementName: string;
        safe: boolean;
        reason: string | null;
    }>;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
    resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null;
};

type LoopHoistIdentifierState = {
    localIdentifiers: ReadonlySet<string>;
};

function normalizeIdentifierName(identifierName: string): string {
    return identifierName.trim().toLowerCase();
}

function loadExpectedReport(): Record<string, ParityScenarioReport> {
    const reportPath = path.resolve("src/lint/test/fixtures/project-analysis-parity/expected-report.json");
    return JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, ParityScenarioReport>;
}

function toRelativeSortedPaths(projectRoot: string, files: ReadonlySet<string>): Array<string> {
    return [...files.values()]
        .map((filePath) => path.relative(projectRoot, filePath).replaceAll("\\", "/"))
        .sort((left, right) => left.localeCompare(right));
}

function createSnapshotFromScenarioReport(projectRoot: string, report: ParityScenarioReport): LintSnapshotLike {
    const renamePlanByPreferredName = new Map<string, (typeof report.renamePlanning)[number]>();
    for (const entry of report.renamePlanning) {
        renamePlanByPreferredName.set(normalizeIdentifierName(entry.preferredReplacementName), entry);
    }

    return {
        isIdentifierNameOccupiedInProject(identifierName: string): boolean {
            return report.occupancy[normalizeIdentifierName(identifierName)] ?? false;
        },
        listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string> {
            const files = report.occurrenceFiles[normalizeIdentifierName(identifierName)] ?? [];
            return new Set(files.map((relativePath) => path.join(projectRoot, relativePath)));
        },
        planFeatherRenames(
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
        ): ReadonlyArray<{
            identifierName: string;
            preferredReplacementName: string;
            safe: boolean;
            reason: string | null;
        }> {
            return requests.map((request) => {
                const existingPlan = renamePlanByPreferredName.get(
                    normalizeIdentifierName(request.preferredReplacementName)
                );
                if (existingPlan) {
                    return existingPlan;
                }

                return {
                    identifierName: request.identifierName,
                    preferredReplacementName: request.preferredReplacementName,
                    safe: true,
                    reason: null
                };
            });
        },
        assessGlobalVarRewrite(
            filePath: string | null,
            hasInitializer: boolean
        ): { allowRewrite: boolean; reason: string | null } {
            const key = `${filePath ? "file" : "null"}_${hasInitializer ? "true" : "false"}`;
            return {
                allowRewrite: report.globalVarSafety[key] ?? false,
                reason: null
            };
        },
        resolveLoopHoistIdentifier(preferredName: string): string | null {
            return report.loopHoistResolution ?? preferredName;
        }
    };
}

function createRefactorProviderFromLintSnapshot(parameters: {
    snapshot: LintSnapshotLike;
    loopHoistState: LoopHoistIdentifierState;
}): RefactorProjectAnalysisProvider {
    return {
        async isIdentifierOccupied(identifierName): Promise<boolean> {
            return parameters.snapshot.isIdentifierNameOccupiedInProject(identifierName);
        },
        async listIdentifierOccurrences(identifierName): Promise<Set<string>> {
            return new Set(parameters.snapshot.listIdentifierOccurrenceFiles(identifierName));
        },
        async planFeatherRenames(requests) {
            return parameters.snapshot.planFeatherRenames(requests).map((entry) => ({
                identifierName: entry.identifierName,
                mode: "project-aware" as const,
                preferredReplacementName: entry.preferredReplacementName,
                replacementName: entry.safe ? entry.preferredReplacementName : entry.identifierName,
                skipReason: entry.reason ?? undefined
            }));
        },
        assessGlobalVarRewrite(filePath, hasInitializer) {
            const lintDecision = parameters.snapshot.assessGlobalVarRewrite(filePath, hasInitializer);
            return {
                allowRewrite: lintDecision.allowRewrite,
                initializerMode: hasInitializer ? "existing" : ("undefined" as const),
                mode: "project-aware" as const
            };
        },
        resolveLoopHoistIdentifier(preferredName) {
            const resolved = parameters.snapshot.resolveLoopHoistIdentifier(
                preferredName,
                parameters.loopHoistState.localIdentifiers
            );
            return {
                identifierName: resolved ?? preferredName,
                mode: "project-aware" as const
            };
        }
    };
}

function normalizeRefactorRenamePlan(
    renamePlan: ReadonlyArray<{
        identifierName: string;
        preferredReplacementName: string;
        replacementName: string;
        skipReason?: string;
    }>
): Array<{ identifierName: string; preferredReplacementName: string; safe: boolean; reason: string | null }> {
    return renamePlan.map((entry) => ({
        identifierName: entry.identifierName,
        preferredReplacementName: entry.preferredReplacementName,
        safe: entry.replacementName === entry.preferredReplacementName,
        reason: entry.skipReason ?? null
    }));
}

async function buildRefactorScenarioReport(parameters: {
    projectRoot: string;
    snapshot: LintSnapshotLike;
    loopHoistState: LoopHoistIdentifierState;
}): Promise<ParityScenarioReport> {
    const engine = new Refactor.RefactorEngine({
        projectAnalysisProvider: createRefactorProviderFromLintSnapshot({
            snapshot: parameters.snapshot,
            loopHoistState: parameters.loopHoistState
        })
    });

    return {
        occupancy: {
            casename: await engine.isIdentifierOccupied("casename"),
            foo: await engine.isIdentifierOccupied("foo"),
            excluded_token: await engine.isIdentifierOccupied("excluded_token"),
            allowed_token: await engine.isIdentifierOccupied("allowed_token")
        },
        occurrenceFiles: {
            casename: toRelativeSortedPaths(parameters.projectRoot, await engine.listIdentifierOccurrences("casename")),
            foo: toRelativeSortedPaths(parameters.projectRoot, await engine.listIdentifierOccurrences("foo")),
            excluded_token: toRelativeSortedPaths(
                parameters.projectRoot,
                await engine.listIdentifierOccurrences("excluded_token")
            ),
            allowed_token: toRelativeSortedPaths(
                parameters.projectRoot,
                await engine.listIdentifierOccurrences("allowed_token")
            )
        },
        renamePlanning: normalizeRefactorRenamePlan(
            await engine.planFeatherRenames(
                [
                    { identifierName: "foo", preferredReplacementName: "CaseName" },
                    { identifierName: "foo", preferredReplacementName: "foo_next" }
                ],
                path.join(parameters.projectRoot, "scripts", "main.gml"),
                parameters.projectRoot
            )
        ),
        loopHoistResolution: engine.resolveLoopHoistIdentifier("loop_length").identifierName,
        globalVarSafety: {
            null_false: engine.assessGlobalVarRewrite(null, false).allowRewrite,
            null_true: engine.assessGlobalVarRewrite(null, true).allowRewrite,
            file_false: engine.assessGlobalVarRewrite(path.join(parameters.projectRoot, "scripts/main.gml"), false)
                .allowRewrite,
            file_true: engine.assessGlobalVarRewrite(path.join(parameters.projectRoot, "scripts/main.gml"), true)
                .allowRewrite
        }
    };
}

void test("refactor consumer path stays capability-parity aligned with lint snapshot fixtures", async () => {
    const fixtureRoot = path.resolve("src/lint/test/fixtures/project-analysis-parity/project");
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "refactor-parity-fixture-"));
    const projectRoot = path.join(tempRoot, "project");

    cpSync(fixtureRoot, projectRoot, { recursive: true });

    const expectedReport = loadExpectedReport();
    const loopHoistState = {
        localIdentifiers: new Set(["loop_length", "loop_length_1"])
    };

    const report = {
        default: await buildRefactorScenarioReport({
            projectRoot,
            snapshot: createSnapshotFromScenarioReport(projectRoot, expectedReport.default),
            loopHoistState
        }),
        allowGeneratedDirectory: await buildRefactorScenarioReport({
            projectRoot,
            snapshot: createSnapshotFromScenarioReport(projectRoot, expectedReport.allowGeneratedDirectory),
            loopHoistState
        })
    };

    assert.deepEqual(report, expectedReport);

    rmSync(tempRoot, { recursive: true, force: true });
});
