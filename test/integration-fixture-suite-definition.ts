import path from "node:path";
import { fileURLToPath } from "node:url";

import { createIntegrationFixtureAdapter } from "./integration-fixture-adapter.js";

function resolveIntegrationFixtureRoot(): string {
    const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
    return rawDirectory.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(rawDirectory, "..", "fixtures", "integration")
        : path.resolve(rawDirectory, "fixtures", "integration");
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
