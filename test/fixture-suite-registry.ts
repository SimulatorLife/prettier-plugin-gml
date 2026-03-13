import type { FixtureAdapter } from "@gmloop/fixture-runner";
import { createFormatFixtureSuiteDefinition } from "@gmloop/format/test-support";
import { createLintFixtureSuiteDefinition } from "@gmloop/lint/test-support";
import { createRefactorFixtureSuiteDefinition } from "@gmloop/refactor/test-support";

import { createIntegrationFixtureSuiteDefinition } from "./integration-fixture-suite-definition.js";

export interface FixtureSuiteRegistration {
    workspaceName: string;
    suiteName: string;
    compiledWorkspaceTestFilePath: string;
    fixtureRoot: string;
    adapter: FixtureAdapter;
}

/**
 * Create the canonical fixture suite registry shared by workspace, aggregate,
 * and profiling fixture runs.
 *
 * @returns Ordered fixture suite registrations for all fixture-owning areas.
 */
export function createFixtureSuiteRegistry(): ReadonlyArray<FixtureSuiteRegistration> {
    return Object.freeze([
        createFormatFixtureSuiteDefinition(),
        createLintFixtureSuiteDefinition(),
        createRefactorFixtureSuiteDefinition(),
        createIntegrationFixtureSuiteDefinition()
    ]);
}
