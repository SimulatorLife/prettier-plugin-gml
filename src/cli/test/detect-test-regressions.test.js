import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
    detectRegressions,
    detectResolvedFailures,
    readTestResults,
    ensureResultsAvailability,
    reportRegressionSummary
} from "../src/commands/detect-test-regressions.mjs";
import { isCliUsageError } from "../src/core/errors.js";

const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';

// These tests intentionally rely on assert.strictEqual-style comparisons because
// Node.js deprecated the legacy assert.equal API. Behaviour has been
// revalidated via `npm test src/cli/test/detect-test-regressions.test.js`.

function writeXml(dir, name, contents) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.xml`), xmlHeader + contents);
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
    const baseDir = path.join(workspace, "base/reports");
    const mergeDir = path.join(workspace, "merge/reports");

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

    const base = readTestResults(["base/reports"], { workspace });
    const merged = readTestResults(["merge/reports"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(regressions[0].from, "passed");
    assert.strictEqual(regressions[0].to, "failed");
});

test("treats failing tests without a base counterpart as regressions", () => {
    const baseDir = path.join(workspace, "base/reports");
    const headDir = path.join(workspace, "reports");

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

    const base = readTestResults(["base/reports"], { workspace });
    const head = readTestResults(["reports"], { workspace });
    const regressions = detectRegressions(base, head);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(regressions[0].from, "missing");
    assert.strictEqual(
        regressions[0].detail?.displayName.includes("new scenario fails"),
        true
    );
});

test("does not treat renamed failures as regressions when totals are stable", () => {
    const baseDir = path.join(workspace, "base/reports");
    const mergeDir = path.join(workspace, "merge/reports");

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

    const base = readTestResults(["base/reports"], { workspace });
    const merged = readTestResults(["merge/reports"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 0);
});

test("parses top-level test cases that are not nested in a suite", () => {
    const baseDir = path.join(workspace, "base/reports");
    const mergeDir = path.join(workspace, "merge/reports");

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

    const base = readTestResults(["base/reports"], { workspace });
    const merged = readTestResults(["merge/reports"], { workspace });
    const regressions = detectRegressions(base, merged);

    assert.strictEqual(regressions.length, 1);
    assert.strictEqual(
        regressions[0].detail?.displayName.includes("top level"),
        true
    );
});

test("ignores checkstyle reports when scanning result directories", () => {
    const resultsDir = path.join(workspace, "reports");

    writeXml(
        resultsDir,
        "tests",
        `<testsuites>
      <testsuite name="sample">
        <testcase name="real failure" classname="suite">
          <failure message="boom" />
        </testcase>
      </testsuite>
    </testsuites>`
    );

    writeXml(
        resultsDir,
        "eslint-checkstyle",
        `<checkstyle version="1.0">
      <file name="src/example.js">
        <error line="1" severity="error" message="nope" source="lint" />
      </file>
    </checkstyle>`
    );

    const head = readTestResults(["reports"], { workspace });

    assert.strictEqual(head.stats.total, 1);
    assert.strictEqual(head.stats.failed, 1);
    assert.strictEqual(
        [...head.results.keys()][0],
        "sample :: suite :: real failure"
    );
    assert.equal(
        head.notes.some((note) =>
            note.includes(
                "Ignoring checkstyle report reports/eslint-checkstyle.xml"
            )
        ),
        true
    );
});

test("records a note when XML lacks test suites or cases", () => {
    const resultsDir = path.join(workspace, "reports");

    writeXml(
        resultsDir,
        "invalid",
        `<report>
      <message>No structured tests</message>
    </report>`
    );

    const result = readTestResults(["reports"], { workspace });

    assert.strictEqual(result.stats.total, 0);
    assert.ok(
        result.notes.some((note) =>
            note.includes("does not contain any test suites or cases")
        )
    );
});

test("normalizes whitespace when describing regression candidates", () => {
    const headDir = path.join(workspace, "reports");

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

    const head = readTestResults(["reports"], { workspace });
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
    const target = { usedDir: "./reports" };

    assert.throws(
        () => ensureResultsAvailability(base, target),
        (error) => {
            assert.equal(isCliUsageError(error), true);
            assert.match(error.message, /Unable to locate base test results/i);
            return true;
        }
    );
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

test("detectResolvedFailures returns failures that now pass or are missing", () => {
    const baseDir = path.join(workspace, "base/reports");
    const mergeDir = path.join(workspace, "merge/reports");

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

    const base = readTestResults(["base/reports"], { workspace });
    const merged = readTestResults(["merge/reports"], { workspace });

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

test("detectRegressions accepts heterogeneous result containers", () => {
    const base = {
        results: {
            "suite :: test :: scenario": {
                key: "suite :: test :: scenario",
                status: "passed"
            }
        },
        stats: { total: 1, passed: 1, failed: 0, skipped: 0 }
    };

    const backing = new Map([
        [
            "suite :: test :: scenario",
            {
                key: "suite :: test :: scenario",
                status: "failed",
                displayName: "suite :: test :: scenario"
            }
        ]
    ]);

    const target = {
        results: {
            get(key) {
                return backing.get(key);
            },
            set(key, value) {
                backing.set(key, value);
                return this;
            },
            entries() {
                return backing.entries();
            },
            [Symbol.iterator]() {
                return backing[Symbol.iterator]();
            }
        },
        stats: { total: 1, passed: 0, failed: 1, skipped: 0 }
    };

    const regressions = detectRegressions(base, target);

    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].from, "passed");
    assert.equal(regressions[0].to, "failed");
    assert.equal(
        regressions[0].detail?.displayName,
        "suite :: test :: scenario"
    );
});
