import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizePathSeparator(value: string): string {
    return value.split(path.sep).join("/");
}

void test("root test discovery includes formatter, lint, and integration fixture suites", async () => {
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

    const requiredFixtureSuites = [
        "src/format/dist/test/formatter-fixtures.test.js",
        "src/lint/dist/test/rule-fixtures.test.js",
        "test/dist/format-semantic-integration.test.js"
    ];

    for (const requiredSuite of requiredFixtureSuites) {
        assert.equal(
            discoveredTests.has(requiredSuite),
            true,
            `Global test discovery is missing required fixture suite '${requiredSuite}'.`
        );
    }
});
