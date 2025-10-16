import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
    detectRegressions,
    readTestResults
} from "../../../scripts/detect-test-regressions.mjs";

const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n';

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

    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].from, "passed");
    assert.equal(regressions[0].to, "failed");
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

    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].from, "missing");
    assert.equal(
        regressions[0].detail?.displayName.includes("new scenario fails"),
        true
    );
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

    assert.equal(regressions.length, 1);
    assert.equal(
        regressions[0].detail?.displayName.includes("top level"),
        true
    );
});
