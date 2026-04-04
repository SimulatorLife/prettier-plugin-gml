import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFormatFixtureAdapter } from "./fixture-adapter.js";

/**
 * Create the canonical format fixture suite definition shared by workspace and
 * aggregate fixture runs.
 *
 * @returns Format fixture suite registration metadata.
 */
export function createFormatFixtureSuiteDefinition() {
    return FixtureRunner.createFixtureSuiteDefinition({
        workspaceName: "format",
        suiteName: "formatter fixtures",
        compiledWorkspaceTestFilePath: "src/format/dist/test/formatter-fixtures.test.js",
        moduleUrl: import.meta.url,
        sourceRelativeSegments: ["fixtures"],
        distRelativeSegments: ["..", "..", "test", "fixtures"],
        adapter: createFormatFixtureAdapter()
    });
}
