import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLintFixtureAdapter } from "./fixture-adapter.js";

function resolveLintFixtureRoot(): string {
    const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
    return rawDirectory.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(rawDirectory, "..", "..", "..", "test", "fixtures")
        : path.resolve(rawDirectory, "..", "fixtures");
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
