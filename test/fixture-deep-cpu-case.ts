import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

function readRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable ${name}.`);
    }

    return value;
}

void test("fixture deep cpu profile case", async () => {
    const workspaceName = readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_WORKSPACE");
    const caseId = readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_CASE_ID");
    const outputPath = readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_OUTPUT");

    const fixtureSuite = createFixtureSuiteRegistry().find((suite) => suite.workspaceName === workspaceName);
    if (!fixtureSuite) {
        throw new Error(`Unknown fixture suite workspace ${workspaceName}.`);
    }

    await FixtureRunner.withDeepCpuProfile(outputPath, async () => {
        const result = await FixtureRunner.runFixtureSuite({
            fixtureRoot: fixtureSuite.fixtureRoot,
            adapter: fixtureSuite.adapter,
            caseIds: [caseId],
            continueOnFailure: true
        });

        if (result.fixtureCases.length !== 1) {
            throw new Error(`Expected exactly one fixture case for ${workspaceName}/${caseId}.`);
        }

        if (result.failures.length > 0) {
            throw result.failures[0]?.error;
        }
    });
});
