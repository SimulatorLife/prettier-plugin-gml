import { FixtureRunner } from "@gmloop/fixture-runner";

import { createIntegrationFixtureSuiteDefinition } from "./integration-fixture-suite-definition.js";

const fixtureSuite = createIntegrationFixtureSuiteDefinition();

await FixtureRunner.registerNodeFixtureSuite(fixtureSuite);
