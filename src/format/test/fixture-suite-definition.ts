import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFormatFixtureAdapter } from "./fixture-adapter.js";

function resolveFormatFixtureRoot(): string {
    return FixtureRunner.resolveFixtureDirectoryFromModuleUrl({
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["fixtures"],
        distRelativeSegments: ["..", "..", "test", "fixtures"]
    });
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
