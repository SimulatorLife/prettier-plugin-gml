import { FixtureRunner } from "@gmloop/fixture-runner";

import { createRefactorFixtureSuiteDefinition } from "./fixture-suite-definition.js";

const fixtureSuite = createRefactorFixtureSuiteDefinition();

await FixtureRunner.registerNodeFixtureSuite(fixtureSuite);
