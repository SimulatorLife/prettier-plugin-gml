import type { FixtureAdapter } from "@gmloop/fixture-runner";

import { createFormatFixtureSuiteDefinition } from "#fixture-test/format";
import { createLintFixtureSuiteDefinition } from "#fixture-test/lint";
import { createRefactorFixtureSuiteDefinition } from "#fixture-test/refactor";

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
