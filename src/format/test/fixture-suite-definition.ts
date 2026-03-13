import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFormatFixtureAdapter } from "./fixture-adapter.js";

function resolveFormatFixtureRoot(): string {
    const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
    return rawDirectory.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(rawDirectory, "..", "..", "test", "fixtures")
        : path.resolve(rawDirectory, "fixtures");
}

/**
 * Create the canonical format fixture suite definition shared by workspace and
 * aggregate fixture runs.
 *
 * @returns Format fixture suite registration metadata.
 */
export function createFormatFixtureSuiteDefinition() {
    return Object.freeze({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        compiledWorkspaceTestFilePath: "src/format/dist/test/formatter-fixtures.test.js",
        fixtureRoot: resolveFormatFixtureRoot(),
        adapter: createFormatFixtureAdapter()
    });
}
