import assert from "node:assert/strict";
import { test } from "node:test";

import { runCliTestCommand } from "../src/cli.js";

void test("lint --help output includes an examples section", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /Examples:/);
});

void test("lint --help output shows a basic lint invocation example", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /pnpm dlx prettier-plugin-gml lint path\/to\/project/);
});

void test("lint --help output shows a --fix example", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /pnpm dlx prettier-plugin-gml lint --fix/);
});

void test("lint --help output shows a --max-warnings CI example with a .gml path", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /--max-warnings 0.*\.gml/);
});
