import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { createFixtureSuiteRegistry } from "./fixture-suite-registry.js";

const execFileAsync = promisify(execFile);

function normalizePathSeparator(value: string): string {
    return value.split(path.sep).join("/");
}

void test("root test discovery includes formatter, lint, refactor, and cross-module integration suites", async () => {
    const { stdout } = await execFileAsync("pnpm", ["-s", "test:files"], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10
    });
    const discoveredTests = new Set(
        stdout
            .split(/\r?\n/u)
            .map((line) => normalizePathSeparator(line.trim()))
            .filter((line) => line.length > 0)
    );

    const requiredFixtureSuites = createFixtureSuiteRegistry().map(
        (fixtureSuite) => fixtureSuite.compiledWorkspaceTestFilePath
    );

    for (const requiredSuite of requiredFixtureSuites) {
        assert.equal(
            discoveredTests.has(requiredSuite),
            true,
            `Global test discovery is missing required fixture suite '${requiredSuite}'.`
        );
    }
});

void test("fixture-only aggregate command points at the shared root registry runner", async () => {
    const { stdout } = await execFileAsync("pnpm", ["-s", "test:fixtures:files"], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10
    });
    const discoveredTests = stdout
        .split(/\r?\n/u)
        .map((line) => normalizePathSeparator(line.trim()))
        .filter((line) => line.length > 0);

    assert.deepEqual(discoveredTests, ["test/dist/fixture-suites.js"]);
});
