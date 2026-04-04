import { FixtureRunner } from "@gmloop/fixture-runner";

import { createLintFixtureAdapter } from "./fixture-adapter.js";

/**
 * Create the canonical lint fixture suite definition shared by workspace and
 * aggregate fixture runs.
 *
 * @returns Lint fixture suite registration metadata.
 */
export function createLintFixtureSuiteDefinition() {
    return FixtureRunner.createFixtureSuiteDefinition({
        workspaceName: "lint",
        suiteName: "lint rule fixtures",
        compiledWorkspaceTestFilePath: "src/lint/dist/test/rules/rule-fixtures.test.js",
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["..", "fixtures"],
        distRelativeSegments: ["..", "..", "..", "test", "fixtures"],
        adapter: createLintFixtureAdapter()
    });
}
