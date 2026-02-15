import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as LintWorkspace from "../src/index.js";

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

function loadExpectedReport(): Record<string, ParityScenarioReport> {
    const reportPath = path.resolve("src/lint/test/fixtures/project-analysis-parity/expected-report.json");
    return JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, ParityScenarioReport>;
}

function toRelativeSortedPaths(projectRoot: string, files: ReadonlySet<string>): Array<string> {
    return [...files.values()]
        .map((filePath) => path.relative(projectRoot, filePath).replaceAll("\\", "/"))
        .sort((left, right) => left.localeCompare(right));
}

function buildLintScenarioReport(parameters: {
    projectRoot: string;
    excludedDirectories: ReadonlySet<string>;
    allowedDirectories: ReadonlyArray<string>;
    loopLocalIdentifiers: ReadonlySet<string>;
}): ParityScenarioReport {
    const provider = LintWorkspace.Lint.services.createTextProjectAnalysisProvider();
    const snapshot = provider.buildSnapshot(parameters.projectRoot, {
        excludedDirectories: parameters.excludedDirectories,
        allowedDirectories: parameters.allowedDirectories
    });

    return {
        occupancy: {
            casename: snapshot.isIdentifierNameOccupiedInProject("casename"),
            foo: snapshot.isIdentifierNameOccupiedInProject("foo"),
            excluded_token: snapshot.isIdentifierNameOccupiedInProject("excluded_token"),
            allowed_token: snapshot.isIdentifierNameOccupiedInProject("allowed_token")
        },
        occurrenceFiles: {
            casename: toRelativeSortedPaths(parameters.projectRoot, snapshot.listIdentifierOccurrenceFiles("casename")),
            foo: toRelativeSortedPaths(parameters.projectRoot, snapshot.listIdentifierOccurrenceFiles("foo")),
            excluded_token: toRelativeSortedPaths(
                parameters.projectRoot,
                snapshot.listIdentifierOccurrenceFiles("excluded_token")
            ),
            allowed_token: toRelativeSortedPaths(
                parameters.projectRoot,
                snapshot.listIdentifierOccurrenceFiles("allowed_token")
            )
        },
        renamePlanning: snapshot
            .planFeatherRenames([
                { identifierName: "foo", preferredReplacementName: "CaseName" },
                { identifierName: "foo", preferredReplacementName: "foo_next" }
            ])
            .map((entry) => ({
                identifierName: entry.identifierName,
                preferredReplacementName: entry.preferredReplacementName,
                safe: entry.safe,
                reason: entry.reason
            })),
        loopHoistResolution: snapshot.resolveLoopHoistIdentifier("loop_length", parameters.loopLocalIdentifiers),
        globalVarSafety: {
            null_false: snapshot.assessGlobalVarRewrite(null, false).allowRewrite,
            null_true: snapshot.assessGlobalVarRewrite(null, true).allowRewrite,
            file_false: snapshot.assessGlobalVarRewrite(path.join(parameters.projectRoot, "scripts/main.gml"), false)
                .allowRewrite,
            file_true: snapshot.assessGlobalVarRewrite(path.join(parameters.projectRoot, "scripts/main.gml"), true)
                .allowRewrite
        }
    };
}

void test("project-analysis snapshot fixtures cover parity edge cases and remain regression-locked", () => {
    const fixtureRoot = path.resolve("src/lint/test/fixtures/project-analysis-parity/project");
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-parity-fixture-"));
    const projectRoot = path.join(tempRoot, "project");

    cpSync(fixtureRoot, projectRoot, { recursive: true });

    const report = {
        default: buildLintScenarioReport({
            projectRoot,
            excludedDirectories: new Set(["generated"]),
            allowedDirectories: [],
            loopLocalIdentifiers: new Set(["loop_length", "loop_length_1"])
        }),
        allowGeneratedDirectory: buildLintScenarioReport({
            projectRoot,
            excludedDirectories: new Set(["generated"]),
            allowedDirectories: [path.join(projectRoot, "generated", "allowed")],
            loopLocalIdentifiers: new Set(["loop_length", "loop_length_1"])
        })
    };

    assert.deepEqual(report, loadExpectedReport());

    rmSync(tempRoot, { recursive: true, force: true });
});
