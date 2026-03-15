import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { type FixtureCase, FixtureRunner } from "@gmloop/fixture-runner";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

interface DeepCpuCaseRequest {
    caseId: string;
    outputPath: string;
}

interface DeepCpuCaseFailure {
    caseId: string;
    message: string;
}

function createFixtureCaseByIdMap(fixtureCases: ReadonlyArray<FixtureCase>): ReadonlyMap<string, FixtureCase> {
    const fixtureCaseById = new Map<string, FixtureCase>();
    for (const fixtureCase of fixtureCases) {
        fixtureCaseById.set(fixtureCase.caseId, fixtureCase);
    }

    return fixtureCaseById;
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

function formatFailureMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return typeof error === "string" ? error : JSON.stringify(error);
}

async function writeDeepCpuFailureReport(failures: ReadonlyArray<DeepCpuCaseFailure>): Promise<void> {
    const outputPath = process.env.GMLOOP_FIXTURE_DEEP_CPU_FAILURES_JSON_OUTPUT;
    if (!outputPath) {
        return;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(failures, null, 2), "utf8");
}

void test("fixture deep cpu profile case", async () => {
    const workspaceName = readRequiredEnvironmentVariable("GMLOOP_FIXTURE_DEEP_CPU_WORKSPACE");
    const requests = readDeepCpuCaseRequests();

    const fixtureSuite = createFixtureSuiteRegistry().find((suite) => suite.workspaceName === workspaceName);
    if (!fixtureSuite) {
        throw new Error(`Unknown fixture suite workspace ${workspaceName}.`);
    }

    const discoveredFixtureCases = await FixtureRunner.discoverFixtureCases(fixtureSuite.fixtureRoot);
    const fixtureCaseById = createFixtureCaseByIdMap(discoveredFixtureCases);
    const failures: Array<DeepCpuCaseFailure> = [];

    for (const request of requests) {
        try {
            const fixtureCase = fixtureCaseById.get(request.caseId);
            if (!fixtureCase) {
                throw new Error(`Expected exactly one fixture case for ${workspaceName}/${request.caseId}.`);
            }

            await FixtureRunner.withDeepCpuProfile(request.outputPath, async () => {
                await FixtureRunner.runDiscoveredFixtureCase({
                    adapter: fixtureSuite.adapter,
                    fixtureCase
                });
            });
        } catch (error) {
            failures.push({
                caseId: request.caseId,
                message: formatFailureMessage(error)
            });
        }
    }

    if (failures.length > 0) {
        await writeDeepCpuFailureReport(failures);
        const failureSummaries = failures.map((failure) => `${failure.caseId}: ${failure.message}`);
        throw new Error(
            `Deep CPU profiling failed for ${workspaceName} (${failures.length} case(s)):\n- ${failureSummaries.join("\n- ")}`
        );
    }
});
