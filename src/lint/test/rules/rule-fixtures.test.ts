import path from "node:path";
import { fileURLToPath } from "node:url";

import { FixtureRunner } from "@gmloop/fixture-runner";

import { Lint } from "../../src/index.js";

function resolveFixtureRoot(): string {
    const rawDirectory = fileURLToPath(new URL(".", import.meta.url));
    return rawDirectory.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(rawDirectory, "..", "..", "..", "test", "fixtures")
        : path.resolve(rawDirectory, "..", "fixtures");
}

await FixtureRunner.registerNodeFixtureSuite({
    fixtureRoot: resolveFixtureRoot(),
    adapter: Lint.testing.createFixtureAdapter()
});
