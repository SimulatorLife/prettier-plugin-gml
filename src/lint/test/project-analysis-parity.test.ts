import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "../src/index.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function resolveParityFixturePath(...segments: Array<string>): string {
    const candidates = [
        path.resolve(testDirectory, "fixtures", "project-analysis-parity", ...segments),
        path.resolve(testDirectory, "../../test/fixtures/project-analysis-parity", ...segments)
    ];
    const resolved = candidates.find((candidate) => existsSync(candidate));
    if (!resolved) {
        throw new Error(`Unable to resolve parity fixture path from candidates: ${candidates.join(", ")}`);
    }

    return resolved;
}

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
    const reportPath = resolveParityFixturePath("expected-report.json");
    return JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, ParityScenarioReport>;
}

function toCanonicalPath(pathValue: string): string {
    try {
        return realpathSync(pathValue);
    } catch {
        return path.resolve(pathValue);
    }
}

function toRelativeSortedPaths(projectRoot: string, files: ReadonlySet<string>): Array<string> {
    const canonicalProjectRoot = toCanonicalPath(projectRoot);
    return [...files.values()]
        .map((filePath) => path.relative(canonicalProjectRoot, toCanonicalPath(filePath)).replaceAll("\\", "/"))
        .sort((left, right) => left.localeCompare(right));
}

function ensureParityScriptFixtures(projectRoot: string): void {
    const scriptsDirectory = path.join(projectRoot, "scripts");
    mkdirSync(scriptsDirectory, { recursive: true });

    const caseCollisionPath = path.join(scriptsDirectory, "case-collision.gml");
    const renameTargetPath = path.join(scriptsDirectory, "rename-target.gml");

    if (!existsSync(caseCollisionPath)) {
        writeFileSync(caseCollisionPath, "var CaseName = 1;\n", "utf8");
    }

    if (!existsSync(renameTargetPath)) {
        writeFileSync(renameTargetPath, "var foo = 1;\nvar casename = foo;\n", "utf8");
    }
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
    const fixtureRoot = resolveParityFixturePath("project");
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-parity-fixture-"));
    const projectRoot = path.join(tempRoot, "project");

    cpSync(fixtureRoot, projectRoot, { recursive: true });
    ensureParityScriptFixtures(projectRoot);
    const canonicalProjectRoot = toCanonicalPath(projectRoot);

    const report = {
        default: buildLintScenarioReport({
            projectRoot: canonicalProjectRoot,
            excludedDirectories: new Set(["generated"]),
            allowedDirectories: [],
            loopLocalIdentifiers: new Set(["loop_length", "loop_length_1"])
        }),
        allowGeneratedDirectory: buildLintScenarioReport({
            projectRoot: canonicalProjectRoot,
            excludedDirectories: new Set(["generated"]),
            allowedDirectories: [path.join(canonicalProjectRoot, "generated", "allowed")],
            loopLocalIdentifiers: new Set(["loop_length", "loop_length_1"])
        })
    };

    assert.deepEqual(report, loadExpectedReport());

    rmSync(tempRoot, { recursive: true, force: true });
});
