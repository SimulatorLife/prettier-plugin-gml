import { FixtureRunner } from "@gmloop/fixture-runner";

import { createRefactorFixtureAdapter } from "./fixture-adapter.js";

function resolveRefactorFixtureRoot(): string {
    return FixtureRunner.resolveFixtureDirectoryFromModuleUrl({
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["fixtures"],
        distRelativeSegments: ["..", "..", "test", "fixtures"]
    });
}

/**
 * Create the canonical refactor fixture suite definition shared by workspace
 * and aggregate fixture runs.
 *
 * @returns Refactor fixture suite registration metadata.
 */
export function createRefactorFixtureSuiteDefinition() {
    return Object.freeze({
        workspaceName: "refactor",
        suiteName: "refactor fixtures",
        compiledWorkspaceTestFilePath: "src/refactor/dist/test/refactor-fixtures.test.js",
        fixtureRoot: resolveRefactorFixtureRoot(),
        adapter: createRefactorFixtureAdapter()
    });
}
