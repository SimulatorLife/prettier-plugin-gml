import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runMemoryCli } from "../lib/memory-cli.js";

test("memory CLI writes suite results to a JSON report", async () => {
    const workspace = await mkdtemp(
        path.join(os.tmpdir(), "memory-cli-report-")
    );
    const reportDir = path.join(workspace, "reports");

    const exitCode = await runMemoryCli({
        argv: ["--iterations", "1"],
        env: {},
        cwd: workspace,
        reportDir
    });

    assert.equal(exitCode, 0);

    const reportPath = path.join(reportDir, "memory.json");
    const reportRaw = await readFile(reportPath, "utf8");
    const payload = JSON.parse(reportRaw);

    assert.equal(typeof payload.generatedAt, "string");
    assert.ok(payload.generatedAt.length > 0);
    assert.equal(typeof payload.suites, "object");

    const suiteResult = payload.suites["normalize-string-list"];
    assert.ok(suiteResult && typeof suiteResult === "object");
    assert.equal(suiteResult.iterations, 1);
    assert.ok(!("error" in suiteResult));
    assert.equal(typeof suiteResult.totalLength, "number");
    assert.equal(typeof suiteResult.heapUsedBefore, "number");
    assert.equal(typeof suiteResult.heapUsedAfter, "number");
    if (suiteResult.heapUsedAfterGc == null) {
        assert.ok(Array.isArray(suiteResult.warnings));
        assert.ok(suiteResult.warnings.length > 0);
    } else {
        assert.equal(typeof suiteResult.heapUsedAfterGc, "number");
    }
});
