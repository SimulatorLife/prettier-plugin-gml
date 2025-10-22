import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
    summarizeReports,
    compareSummaryReports
} from "../commands/detect-test-regressions.mjs";

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

function writeFileSync(relativePath, contents) {
    const filePath = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
}

test("summarizeReports aggregates junit, coverage, and checkstyle totals", () => {
    const resultsDir = path.join(workspace, "test-results");
    writeFileSync(
        "test-results/results.xml",
        `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="core" tests="5" failures="1" errors="0" skipped="1" time="2.5">
    <testcase name="passes" classname="suite" />
    <testcase name="fails" classname="suite">
      <failure message="boom" />
    </testcase>
  </testsuite>
  <testsuite name="extra" tests="3" failures="0" errors="1" skipped="0" time="1.5" />
</testsuites>`
    );

    writeFileSync(
        "test-results/lcov.info",
        "TN:\nSF:/tmp/example.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n"
    );

    writeFileSync(
        "test-results/checkstyle.xml",
        `<?xml version="1.0"?>
<checkstyle>
  <file name="example.js">
    <error severity="warning" message="be careful" />
    <error severity="error" message="broken" />
  </file>
</checkstyle>`
    );

    const { outputPath, summary } = summarizeReports({
        inputDir: resultsDir,
        outputDir: resultsDir
    });

    assert.strictEqual(path.basename(outputPath), "summary.json");
    assert.ok(fs.existsSync(outputPath));

    assert.strictEqual(summary.tests.total, 8);
    assert.strictEqual(summary.tests.failed, 2);
    assert.strictEqual(summary.tests.passed, 5);
    assert.strictEqual(summary.tests.skipped, 1);
    assert.strictEqual(summary.tests.duration, 4);

    assert.ok(summary.coverage);
    assert.strictEqual(summary.coverage.found, 2);
    assert.strictEqual(summary.coverage.hit, 1);
    assert.ok(Number.isFinite(summary.coverage.pct));

    assert.ok(summary.lint);
    assert.strictEqual(summary.lint.warnings, 1);
    assert.strictEqual(summary.lint.errors, 1);
});

test("summaries without optional artefacts are still written", () => {
    const resultsDir = path.join(workspace, "test-results");
    writeFileSync(
        "test-results/only.xml",
        `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="solo" tests="2" failures="0" errors="0" skipped="0" time="1" />
</testsuites>`
    );

    const { summary } = summarizeReports({
        inputDir: resultsDir,
        outputDir: resultsDir
    });

    assert.strictEqual(summary.tests.total, 2);
    assert.strictEqual(summary.tests.failed, 0);
    assert.strictEqual(summary.coverage, null);
    assert.strictEqual(summary.lint, null);
});

test("compareSummaryReports produces deltas and regression flags", () => {
    const baseDir = path.join(workspace, "base");
    const headDir = path.join(workspace, "head");

    writeFileSync(
        "base/test-results/results.xml",
        `<?xml version="1.0"?>
<testsuites>
  <testsuite name="base" tests="4" failures="0" errors="0" skipped="0" time="1.25" />
</testsuites>`
    );

    writeFileSync(
        "head/test-results/results.xml",
        `<?xml version="1.0"?>
<testsuites>
  <testsuite name="head" tests="4" failures="1" errors="0" skipped="0" time="2.0" />
</testsuites>`
    );

    writeFileSync(
        "head/test-results/lcov.info",
        "TN:\nSF:/tmp/head.js\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n"
    );

    writeFileSync(
        "head/test-results/checkstyle.xml",
        `<?xml version="1.0"?>
<checkstyle>
  <file name="head.js">
    <error severity="error" message="bad" />
  </file>
</checkstyle>`
    );

    const { outputPath: baseSummaryPath } = summarizeReports({
        inputDir: path.join(baseDir, "test-results"),
        outputDir: baseDir
    });
    const { outputPath: headSummaryPath } = summarizeReports({
        inputDir: path.join(headDir, "test-results"),
        outputDir: headDir
    });

    const { comparison } = compareSummaryReports({
        reports: [
            { label: "base", filePath: baseSummaryPath },
            { label: "head", filePath: headSummaryPath }
        ],
        outputDir: workspace
    });

    assert.strictEqual(comparison.comparisons.length, 1);
    const diff = comparison.comparisons[0];

    assert.strictEqual(diff.tests.failed.delta, 1);
    assert.strictEqual(diff.tests.duration.target, 2);
    assert.strictEqual(diff.regressions.newFailures, 1);
    assert.strictEqual(diff.regressions.hasRegression, true);

    assert.ok(diff.coverage);
    assert.strictEqual(diff.coverage.pct.target > diff.coverage.pct.base, true);
    assert.ok(diff.lint);
    assert.strictEqual(diff.lint.errors.delta, 1);
});
