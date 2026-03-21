import { FixtureRunner } from "@gmloop/fixture-runner";

import { createLintFixtureSuiteDefinition } from "./fixture-suite-definition.js";

const fixtureSuite = createLintFixtureSuiteDefinition();

await FixtureRunner.registerNodeFixtureSuite(fixtureSuite);
