import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRefactorFixtureAdapter } from "./fixture-adapter.js";

function resolveRefactorFixtureRoot(): string {
    const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
    return rawDirectory.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(rawDirectory, "..", "..", "test", "fixtures")
        : path.resolve(rawDirectory, "fixtures");
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
