import { FixtureRunner } from "@gmloop/fixture-runner";

import { createIntegrationFixtureAdapter } from "./integration-fixture-adapter.js";

function resolveIntegrationFixtureRoot(): string {
    return FixtureRunner.resolveFixtureDirectoryFromModuleUrl({
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["fixtures", "integration"],
        distRelativeSegments: ["..", "fixtures", "integration"]
    });
}

/**
 * Create the canonical integration fixture suite definition shared by workspace
 * and aggregate fixture runs.
 *
 * @returns Integration fixture suite registration metadata.
 */
export function createIntegrationFixtureSuiteDefinition() {
    return Object.freeze({
        workspaceName: "integration",
        suiteName: "cross-module integration fixtures",
        compiledWorkspaceTestFilePath: "test/dist/cross-module-integration.test.js",
        fixtureRoot: resolveIntegrationFixtureRoot(),
        adapter: createIntegrationFixtureAdapter()
    });
}
