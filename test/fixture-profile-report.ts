import path from "node:path";
import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

function profilingEnabled(): boolean {
    return process.env.GMLOOP_FIXTURE_PROFILE === "1";
}

function formatFixtureFailureMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return typeof error === "string" ? error : JSON.stringify(error);
}

async function runProfileCollection(): Promise<void> {
    const collector = FixtureRunner.createProfileCollector();
    const fixtureSuites = createFixtureSuiteRegistry();
    const runFailures: Array<string> = [];

    for (const fixtureSuite of fixtureSuites) {
        const result = await FixtureRunner.runFixtureSuite({
            fixtureRoot: fixtureSuite.fixtureRoot,
            adapter: fixtureSuite.adapter,
            profileCollector: collector,
            continueOnFailure: true
        });
        runFailures.push(
            ...result.failures.map(
                (failure) =>
                    `[${fixtureSuite.workspaceName}] ${failure.fixtureCase.caseId}: ${formatFixtureFailureMessage(failure.error)}`
            )
        );
    }

    const report = collector.createReport();
    const outputPath = process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT
        ? path.resolve(process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT)
        : path.resolve(process.cwd(), "reports", "fixture-profile.json");

    await FixtureRunner.writeJsonProfileReport(report, outputPath);
    console.log(FixtureRunner.renderHumanProfileReport(report));

    if (runFailures.length > 0) {
        throw new Error(`Fixture profiling encountered failing cases:\n- ${runFailures.join("\n- ")}`);
    }
}

void test("fixture profile report", async () => {
    if (!profilingEnabled()) {
        return;
    }

    await runProfileCollection();
});
