import { FixtureRunner } from "@gmloop/fixture-runner";

import { createFormatFixtureSuiteDefinition } from "./fixture-suite-definition.js";

const fixtureSuite = createFormatFixtureSuiteDefinition();

await FixtureRunner.registerNodeFixtureSuite(fixtureSuite);
