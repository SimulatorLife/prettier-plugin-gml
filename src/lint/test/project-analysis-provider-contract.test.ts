import assert from "node:assert/strict";
import test from "node:test";

import type {
    ProjectAnalysisBuildOptions,
    ProjectAnalysisProvider,
    ProjectAnalysisSnapshot
} from "../src/services/project-analysis-provider.js";

type CanonicalSnapshotMethodTable = {
    isIdentifierNameOccupiedInProject: ProjectAnalysisSnapshot["isIdentifierNameOccupiedInProject"];
    listIdentifierOccurrenceFiles: ProjectAnalysisSnapshot["listIdentifierOccurrenceFiles"];
    planFeatherRenames: ProjectAnalysisSnapshot["planFeatherRenames"];
    assessGlobalVarRewrite: ProjectAnalysisSnapshot["assessGlobalVarRewrite"];
    resolveLoopHoistIdentifier: ProjectAnalysisSnapshot["resolveLoopHoistIdentifier"];
};

const CANONICAL_PROVIDER_METHOD_NAMES = [
    "isIdentifierNameOccupiedInProject",
    "listIdentifierOccurrenceFiles",
    "planFeatherRenames",
    "assessGlobalVarRewrite",
    "resolveLoopHoistIdentifier"
] as const;

function createContractFixtureSnapshot(): ProjectAnalysisSnapshot {
    const methodTable: CanonicalSnapshotMethodTable = {
        isIdentifierNameOccupiedInProject(identifierName): boolean {
            return identifierName.length > 0;
        },
        listIdentifierOccurrenceFiles(_identifierName): ReadonlySet<string> {
            return new Set<string>();
        },
        planFeatherRenames(requests) {
            return requests.map((request) => ({
                identifierName: request.identifierName,
                preferredReplacementName: request.preferredReplacementName,
                safe: true,
                reason: null
            }));
        },
        assessGlobalVarRewrite(_filePath, _hasInitializer) {
            return {
                allowRewrite: false,
                reason: "missing-project-context"
            };
        },
        resolveLoopHoistIdentifier(_preferredName, _localIdentifierNames): string | null {
            return null;
        }
    };

    return {
        capabilities: new Set([
            "IDENTIFIER_OCCUPANCY",
            "IDENTIFIER_OCCURRENCES",
            "LOOP_HOIST_NAME_RESOLUTION",
            "RENAME_CONFLICT_PLANNING"
        ]),
        ...methodTable
    };
}

void test("canonical provider contract fixture uses one owner surface", () => {
    const buildOptions: ProjectAnalysisBuildOptions = {
        excludedDirectories: new Set<string>(),
        allowedDirectories: []
    };

    const provider: ProjectAnalysisProvider = {
        buildSnapshot(_projectRoot, _options) {
            return createContractFixtureSnapshot();
        }
    };

    const snapshot = provider.buildSnapshot("/tmp/project", buildOptions);
    assert.deepEqual(
        Object.keys(snapshot).filter((name) => name !== "capabilities"),
        [...CANONICAL_PROVIDER_METHOD_NAMES]
    );
});
