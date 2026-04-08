import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/cli.js";

const { isNodeTestRunnerProcess, shouldAutoRunCliProcess } = __test__;

void test("isNodeTestRunnerProcess identifies node --test execution flags", () => {
    assert.equal(isNodeTestRunnerProcess(["--test"]), true);
    assert.equal(isNodeTestRunnerProcess(["--test-reporter=tap"]), true);
    assert.equal(isNodeTestRunnerProcess(["--test=src/cli/test/cli-entrypoint-run-guard.test.ts"]), true);
    assert.equal(isNodeTestRunnerProcess(["--inspect"]), false);
});

void test("shouldAutoRunCliProcess blocks CLI autorun when skip env flag is set", () => {
    assert.equal(
        shouldAutoRunCliProcess(
            {
                PRETTIER_PLUGIN_GML_SKIP_CLI_RUN: "1"
            },
            []
        ),
        false
    );
});

void test("shouldAutoRunCliProcess blocks CLI autorun in node test runner processes", () => {
    assert.equal(shouldAutoRunCliProcess({}, ["--test"]), false);
});

void test("shouldAutoRunCliProcess allows autorun outside test and without skip flag", () => {
    assert.equal(shouldAutoRunCliProcess({}, ["--inspect"]), true);
});
