import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

void test("lint --help output documents --path and --list options", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /--path <path>/);
    assert.match(stdout, /--config <path>/);
    assert.match(stdout, /--list/);
    assert.match(stdout, /--verbose/);
});

void test("lint --list prints command settings and exits without linting", async () => {
    const { stdout, stderr, exitCode } = await runCliTestCommand({ argv: ["lint", "--list"] });

    assert.equal(exitCode, 0);
    assert.match(stdout, /Path override:/);
    assert.match(stdout, /Fix mode:/);
    assert.equal(stderr, "");
});

void test("lint --help output shows a --max-warnings CI example with a .gml path", async () => {
    const { stdout } = await runCliTestCommand({ argv: ["lint", "--help"] });

    assert.match(stdout, /--max-warnings 0.*\.gml/);
});

void test("lint reports when no .gml files are found in the provided path", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "gmloop-cli-lint-empty-"));

    try {
        await writeFile(path.join(temporaryDirectory, "readme.txt"), "not gml\n", "utf8");

        const result = await runCliTestCommand({
            argv: ["lint", temporaryDirectory]
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stderr, /No \.gml files were linted in/);
        assert.match(result.stderr, /Lint only processes \.gml sources/);
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});
