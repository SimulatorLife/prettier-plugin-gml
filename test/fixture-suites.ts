import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

for (const fixtureSuite of createFixtureSuiteRegistry()) {
    await FixtureRunner.registerNodeFixtureSuite({
        fixtureRoot: fixtureSuite.fixtureRoot,
        adapter: fixtureSuite.adapter
    });
}
