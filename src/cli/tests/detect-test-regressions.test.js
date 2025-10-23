import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
    detectRegressions,
    detectResolvedFailures,
    readTestResults,
    ensureResultsAvailability,
    reportRegressionSummary,
    summarizeReports,
    compareSummaryReports
} from "../commands/detect-test-regressions.mjs";
import { isCliUsageError } from "../lib/cli-errors.js";

const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';

// These tests intentionally rely on assert.strictEqual-style comparisons because
// Node.js deprecated the legacy assert.equal API. Behaviour has been
// revalidated via `npm test src/cli/tests/detect-test-regressions.test.js`.

function writeXml(dir, name, contents) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.xml`), xmlHeader + contents);
}

function writeCheckstyle(dir, contents) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, "eslint-checkstyle.xml"),
        xmlHeader + contents
    );
}

function writeLcov(dir, contents) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "lcov.info"), contents);
}

let workspace;

beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "gml-regression-"));
});

afterEach(() => {
    if (workspace && fs.existsSync(workspace)) {
        fs.rmSync(workspace, { recursive: true, force: true });
    }
    workspace = undefined;
});

test("detects regressions when a previously passing test now fails", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const mergeDir = path.join(workspace, "merge/test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="formats node" classname="test" />
      </testsuite>
    </testsuites>`
    );

    writeXml(
        mergeDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="formats node" classname="test">
          <failure message="boom" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    const base = readTestResults(["base/test-results"], { workspace });
    const merged = readTestResults(["merge/test-results"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(regressions[0].from, "passed");
    assert.strictEqual(regressions[0].to, "failed");
});

test("treats failing tests without a base counterpart as regressions", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const headDir = path.join(workspace, "test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testsuite name="existing">
        <testcase name="stays green" classname="test" />
      </testsuite>
    </testsuites>`
    );

    writeXml(
        headDir,
        "suite",
        `<testsuites>
      <testsuite name="existing">
        <testcase name="stays green" classname="test" />
      </testsuite>
      <testcase name="new scenario fails" classname="test">
        <failure message="nope" />
      </testcase>
    </testsuites>`
    );

    const base = readTestResults(["base/test-results"], { workspace });
    const head = readTestResults(["test-results"], { workspace });
    const regressions = detectRegressions(base, head);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(regressions[0].from, "missing");
    assert.strictEqual(
        regressions[0].detail?.displayName.includes("new scenario fails"),
        true
    );
});

test("does not treat renamed failures as regressions when totals are stable", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const mergeDir = path.join(workspace, "merge/test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="renamed later" classname="test">
          <failure message="boom" />
        </testcase>
        <testcase name="stays green" classname="test" />
      </testsuite>
    </testsuites>`
    );

    writeXml(
        mergeDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="now failing" classname="test">
          <failure message="still broken" />
        </testcase>
        <testcase name="stays green" classname="test" />
      </testsuite>
    </testsuites>`
    );

    const base = readTestResults(["base/test-results"], { workspace });
    const merged = readTestResults(["merge/test-results"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 0);
});

test("parses top-level test cases that are not nested in a suite", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const mergeDir = path.join(workspace, "merge/test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testcase name="top level" classname="root" />
    </testsuites>`
    );

    writeXml(
        mergeDir,
        "suite",
        `<testsuites>
      <testcase name="top level" classname="root">
        <failure message="whoops" />
      </testcase>
    </testsuites>`
    );

    const base = readTestResults(["base/test-results"], { workspace });
    const merged = readTestResults(["merge/test-results"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(
        regressions[0].detail?.displayName.includes("top level"),
        true
    );
});

test("normalizes whitespace when describing regression candidates", () => {
    const headDir = path.join(workspace, "test-results");

    writeXml(
        headDir,
        "suite",
        `<testsuites>
      <testsuite name=" outer ">
        <testsuite name=" inner ">
          <testcase name="  spaced name  " classname="  spaced class  " file="  /tmp/example  ">
            <failure message="boom" />
          </testcase>
        </testsuite>
      </testsuite>
    </testsuites>`
    );

    const head = readTestResults(["test-results"], { workspace });
    const records = [...head.results.values()];

    assert.strictEqual(records.length, 1);
    const record = records[0];

    assert.strictEqual(
        record.key,
        "outer :: inner :: spaced class :: spaced name"
    );
    assert.strictEqual(
        record.displayName,
        "outer :: inner :: spaced name [/tmp/example]"
    );
});

test("ensureResultsAvailability throws when base results are unavailable", () => {
    const base = { usedDir: null };
    const target = { usedDir: "./test-results" };

    assert.throws(
        () => ensureResultsAvailability(base, target),
        (error) => {
            assert.equal(isCliUsageError(error), true);
            assert.match(error.message, /Unable to locate base test results/i);
            return true;
        }
    );
});

test("summarizeReports aggregates test, lint, and coverage artifacts", () => {
    const root = path.join(workspace, "junit-head");
    const inputDir = path.join(root, "test-results");

    writeXml(
        inputDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="passes" classname="spec" time="0.5" />
        <testcase name="fails" classname="spec" time="0.5">
          <failure message="boom" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    writeCheckstyle(
        inputDir,
        `<checkstyle version="1.0">
      <file name="src/example.js">
        <error line="1" severity="warning" message="warn" source="x" />
        <error line="2" severity="error" message="error" source="x" />
      </file>
    </checkstyle>`
    );

    writeLcov(
        inputDir,
        `TN:\nSF:/tmp/example.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n`
    );

    const { summary, outputPath } = summarizeReports({
        inputDir,
        outputDir: root,
        target: "head"
    });

    assert.ok(outputPath);
    const fromDisk = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.deepEqual(fromDisk, summary);

    assert.strictEqual(summary.target, "head");
    assert.strictEqual(summary.tests.total, 2);
    assert.strictEqual(summary.tests.failed, 1);
    assert.strictEqual(summary.tests.passed, 1);
    assert.strictEqual(summary.tests.skipped, 0);
    assert.strictEqual(summary.lint.errors, 1);
    assert.strictEqual(summary.lint.warnings, 1);
    assert.strictEqual(summary.coverage.covered, 1);
    assert.strictEqual(summary.coverage.total, 2);
    assert.ok(
        summary.coverage.pct !== null &&
            Math.abs(summary.coverage.pct - 50) < 0.001
    );
});

test("compareSummaryReports highlights regressions across summaries", () => {
    const baseRoot = path.join(workspace, "junit-base");
    const headRoot = path.join(workspace, "junit-head");
    const baseInput = path.join(baseRoot, "test-results");
    const headInput = path.join(headRoot, "test-results");

    writeXml(
        baseInput,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="shared" classname="spec" time="0.25" />
      </testsuite>
    </testsuites>`
    );
    writeXml(
        headInput,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="shared" classname="spec" time="0.25">
          <failure message="boom" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    writeCheckstyle(
        baseInput,
        `<checkstyle version="1.0">
      <file name="src/base.js" />
    </checkstyle>`
    );
    writeCheckstyle(
        headInput,
        `<checkstyle version="1.0">
      <file name="src/head.js">
        <error line="5" severity="error" message="lint" source="x" />
      </file>
    </checkstyle>`
    );

    writeLcov(
        baseInput,
        `TN:\nSF:/tmp/example.js\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n`
    );
    writeLcov(
        headInput,
        `TN:\nSF:/tmp/example.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n`
    );

    const baseSummary = summarizeReports({
        inputDir: baseInput,
        outputDir: baseRoot,
        target: "base"
    });
    const headSummary = summarizeReports({
        inputDir: headInput,
        outputDir: headRoot,
        target: "head"
    });

    assert.ok(baseSummary.outputPath);
    assert.ok(headSummary.outputPath);

    const comparisonDir = path.join(workspace, "test-results");
    const { report, outputPath } = compareSummaryReports(
        [
            { label: "base", path: baseSummary.outputPath },
            { label: "head", path: headSummary.outputPath }
        ],
        { outputDir: comparisonDir }
    );

    assert.ok(outputPath);
    const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.deepEqual(parsed, report);

    assert.strictEqual(report.comparisons.length, 1);
    const comparison = report.comparisons[0];
    assert.strictEqual(comparison.base, "base");
    assert.strictEqual(comparison.target, "head");
    assert.strictEqual(comparison.regressions.hasRegression, true);
    assert.strictEqual(comparison.regressions.newFailures, 1);
    assert.strictEqual(comparison.regressions.lintErrors, 1);
    assert.ok(comparison.regressions.coverageDrop > 0);
});

test("reportRegressionSummary returns failure details when regressions exist", () => {
    const summary = reportRegressionSummary(
        [
            {
                key: "suite :: test",
                from: "passed",
                to: "failed",
                detail: { displayName: "suite :: test" }
            }
        ],
        "PR head",
        { resolvedFailures: [] }
    );

    assert.strictEqual(summary.exitCode, 1);
    assert.deepEqual(summary.lines, [
        "New failing tests detected (compared to base using PR head):",
        "- suite :: test (passed -> failed)"
    ]);
});

test("reportRegressionSummary returns success details when no regressions exist", () => {
    const summary = reportRegressionSummary([], "PR head");

    assert.strictEqual(summary.exitCode, 0);
    assert.deepEqual(summary.lines, [
        "No new failing tests compared to base using PR head."
    ]);
});

test("reportRegressionSummary clarifies when regressions offset resolved failures", () => {
    const summary = reportRegressionSummary(
        [
            {
                key: "suite :: new failure",
                from: "passed",
                to: "failed",
                detail: { displayName: "suite :: new failure" }
            }
        ],
        "PR head",
        {
            resolvedFailures: [
                {
                    key: "suite :: resolved failure",
                    from: "failed",
                    to: "passed",
                    detail: { displayName: "suite :: resolved failure" }
                }
            ]
        }
    );

    assert.strictEqual(summary.exitCode, 1);
    assert.deepEqual(summary.lines, [
        "New failing tests detected (compared to base using PR head):",
        "- suite :: new failure (passed -> failed)",
        "Note: 1 previously failing test is now passing or missing, so totals may appear unchanged."
    ]);
});

test("runCli ignores legacy PR summary command arguments", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const headDir = path.join(workspace, "test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="stays green" classname="test" />
      </testsuite>
    </testsuites>`
    );

    writeXml(
        headDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="stays green" classname="test" />
      </testsuite>
    </testsuites>`
    );

    const cliPath = path.resolve(
        "src/cli/commands/detect-test-regressions.mjs"
    );
    const result = spawnSync(
        process.execPath,
        [cliPath, "pr-summary-table-comment"],
        {
            cwd: workspace,
            env: { ...process.env, GITHUB_WORKSPACE: workspace },
            encoding: "utf8"
        }
    );

    assert.strictEqual(result.status, 0);
    assert.match(
        result.stdout,
        /No new failing tests compared to base using PR head/
    );
    assert.match(
        result.stderr,
        /Ignoring 1 legacy CLI argument: 'pr-summary-table-comment'/
    );
});

test("detectResolvedFailures returns failures that now pass or are missing", () => {
    const baseDir = path.join(workspace, "base/test-results");
    const mergeDir = path.join(workspace, "merge/test-results");

    writeXml(
        baseDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="existing failure" classname="test">
          <failure message="nope" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    writeXml(
        mergeDir,
        "suite",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="existing failure" classname="test" />
        <testcase name="new failure" classname="test">
          <failure message="boom" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    const base = readTestResults(["base/test-results"], { workspace });
    const merged = readTestResults(["merge/test-results"], { workspace });

    const resolvedFailures = detectResolvedFailures(base, merged);
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(resolvedFailures.length, 1);
    assert.strictEqual(
        resolvedFailures[0].key,
        "sample :: test :: existing failure"
    );
    assert.strictEqual(resolvedFailures[0].to, "passed");

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(regressions[0].key, "sample :: test :: new failure");
});
