import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

interface DeepCpuCaseRequest {
    caseId: string;
    outputPath: string;
}

function readRequiredEnvironmentVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable ${name}.`);
    }

    return value;
}

function readDeepCpuCaseRequests(): ReadonlyArray<DeepCpuCaseRequest> {
    const batchRequestsJson = process.env.GMLOOP_FIXTURE_DEEP_CPU_CASES_JSON;
    if (batchRequestsJson) {
        const parsed = JSON.parse(batchRequestsJson) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("GMLOOP_FIXTURE_DEEP_CPU_CASES_JSON must be a non-empty JSON array.");
        }

        return parsed.map((entry) => {
            if (
                typeof entry !== "object" ||
                entry === null ||
                typeof (entry as { caseId?: unknown }).caseId !== "string" ||
                typeof (entry as { outputPath?: unknown }).outputPath !== "string"
            ) {
                throw new Error("Each deep CPU case request must include string caseId and outputPath properties.");
            }

            return {
                caseId: (entry as { caseId: string }).caseId,
                outputPath: (entry as { outputPath: string }).outputPath
            };
        });
    }

    return [
        {
            caseId: readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_CASE_ID"),
            outputPath: readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_OUTPUT")
        }
    ];
}

void test("fixture deep cpu profile case", async () => {
    const workspaceName = readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_WORKSPACE");
    const requests = readDeepCpuCaseRequests();

    const fixtureSuite = createFixtureSuiteRegistry().find((suite) => suite.workspaceName === workspaceName);
    if (!fixtureSuite) {
        throw new Error(`Unknown fixture suite workspace ${workspaceName}.`);
    }

    const discoveredFixtureCases = await FixtureRunner.discoverFixtureCases(fixtureSuite.fixtureRoot);

    for (const request of requests) {
        await FixtureRunner.withDeepCpuProfile(request.outputPath, async () => {
            const result = await FixtureRunner.runFixtureSuite({
                fixtureRoot: fixtureSuite.fixtureRoot,
                adapter: fixtureSuite.adapter,
                caseIds: [request.caseId],
                continueOnFailure: true,
                discoveredFixtureCases
            });

            if (result.fixtureCases.length !== 1) {
                throw new Error(`Expected exactly one fixture case for ${workspaceName}/${request.caseId}.`);
            }

            if (result.failures.length > 0) {
                throw result.failures[0]?.error;
            }
        });
    }
});
