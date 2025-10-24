import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT_PATH = path.resolve("src/cli/commands/run-tests-with-junit.mjs");

function createWorkspace(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTestFile(workspace, fileName, contents) {
    const filePath = path.join(workspace, fileName);
    fs.writeFileSync(filePath, `${contents}\n`);
    return filePath;
}

test("run-tests-with-junit produces junit report for passing tests", () => {
    const workspace = createWorkspace("junit-pass-");
    try {
        const testFile = writeTestFile(
            workspace,
            "passing.test.mjs",
            "import test from 'node:test';\n" + "test('passes', () => {});"
        );

        const result = spawnSync(process.execPath, [SCRIPT_PATH, testFile], {
            cwd: workspace,
            encoding: "utf8"
        });

        assert.strictEqual(result.error, undefined);
        assert.strictEqual(result.status, 0);

        const reportPath = path.join(workspace, "reports", "tests.xml");
        assert.ok(fs.existsSync(reportPath));

        const xml = fs.readFileSync(reportPath, "utf8");
        assert.match(xml, /<testcase name=\"passes\"/);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("run-tests-with-junit writes fallback report when test runner fails", () => {
    const workspace = createWorkspace("junit-fallback-");
    try {
        const testFile = writeTestFile(
            workspace,
            "broken.test.mjs",
            "import test from 'node:test';\n test('placeholder', () => {});"
        );

        const result = spawnSync(process.execPath, [SCRIPT_PATH, testFile], {
            cwd: workspace,
            encoding: "utf8",
            env: { ...process.env, FORCE_JUNIT_FALLBACK: "1" }
        });

        assert.ok(
            result.status !== 0 || result.signal,
            "expected a non-zero exit status"
        );

        const reportPath = path.join(workspace, "reports", "tests.xml");
        assert.ok(fs.existsSync(reportPath));

        const xml = fs.readFileSync(reportPath, "utf8");
        assert.match(
            xml,
            /<failure message=\"Test runner (?:terminated by signal|exited with status)/,
            "fallback report should describe the failure"
        );
        assert.match(xml, /Generated fallback JUnit report/);
    } finally {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});
