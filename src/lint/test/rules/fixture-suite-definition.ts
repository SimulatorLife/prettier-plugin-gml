import { FixtureRunner } from "@gmloop/fixture-runner";

import { createLintFixtureAdapter } from "./fixture-adapter.js";

function resolveLintFixtureRoot(): string {
    return FixtureRunner.resolveFixtureDirectoryFromModuleUrl({
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["..", "fixtures"],
        distRelativeSegments: ["..", "..", "..", "test", "fixtures"]
    });
}

/**
 * Create the canonical lint fixture suite definition shared by workspace and
 * aggregate fixture runs.
 *
 * @returns Lint fixture suite registration metadata.
 */
export function createLintFixtureSuiteDefinition() {
    return Object.freeze({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        compiledWorkspaceTestFilePath: "src/lint/dist/test/rules/rule-fixtures.test.js",
        fixtureRoot: resolveLintFixtureRoot(),
        adapter: createLintFixtureAdapter()
    });
}
