import path from "node:path";
import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";
import { Format } from "@gmloop/format";
import { Lint } from "@gmloop/lint";
import { Refactor } from "@gmloop/refactor";

import { createIntegrationFixtureAdapter } from "./integration-fixture-adapter.js";

function profilingEnabled(): boolean {
    return process.env.GMLOOP_FIXTURE_PROFILE === "1";
}

async function runProfileCollection(): Promise<void> {
    const collector = FixtureRunner.createProfileCollector();

    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "format", "test", "fixtures"),
        adapter: Format.testing.createFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "lint", "test", "fixtures"),
        adapter: Lint.testing.createFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "src", "refactor", "test", "fixtures"),
        adapter: Refactor.testing.createFixtureAdapter(),
        profileCollector: collector
    });
    await FixtureRunner.runFixtureSuite({
        fixtureRoot: path.resolve(process.cwd(), "test", "fixtures", "integration"),
        adapter: createIntegrationFixtureAdapter(),
        profileCollector: collector
    });

    const report = collector.createReport();
    const outputPath = process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT
        ? path.resolve(process.env.GMLOOP_FIXTURE_PROFILE_OUTPUT)
        : path.resolve(process.cwd(), "reports", "fixture-profile.json");

    await FixtureRunner.writeJsonProfileReport(report, outputPath);
    console.log(FixtureRunner.renderHumanProfileReport(report));
}

void test("fixture profile report", async () => {
    if (!profilingEnabled()) {
        return;
    }

    await runProfileCollection();
});
