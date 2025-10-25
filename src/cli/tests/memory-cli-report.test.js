import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runMemoryCli } from "../features/memory/index.js";

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

    assert.equal(typeof payload.environment, "object");
    assert.equal(typeof payload.environment.nodeVersion, "string");
    assert.ok(payload.environment.nodeVersion.length > 0);
    assert.equal(typeof payload.generatedAt, "string");
    assert.ok(payload.generatedAt.length > 0);
    assert.equal(typeof payload.suites, "object");

    const normalizeSuite = payload.suites["normalize-string-list"];
    assert.ok(normalizeSuite && typeof normalizeSuite === "object");
    assert.equal(normalizeSuite.iterations, 1);
    assert.equal(typeof normalizeSuite.description, "string");
    assert.ok(!("error" in normalizeSuite));
    assert.equal(typeof normalizeSuite.totalLength, "number");
    assert.equal(typeof normalizeSuite.heapUsedBefore, "number");
    assert.equal(typeof normalizeSuite.heapUsedAfter, "number");
    assert.ok(
        normalizeSuite.memory && typeof normalizeSuite.memory === "object"
    );
    assert.equal(normalizeSuite.memory.unit, "bytes");
    assert.equal(typeof normalizeSuite.memory.before.heapUsed, "number");
    assert.equal(typeof normalizeSuite.memory.delta.heapUsed, "number");
    assert.equal(typeof normalizeSuite.memory.deltaPerIteration, "object");
    if (normalizeSuite.heapUsedAfterGc == null) {
        assert.ok(Array.isArray(normalizeSuite.warnings));
        assert.ok(
            normalizeSuite.warnings.some((warning) =>
                warning.includes("--expose-gc")
            )
        );
    } else {
        assert.equal(typeof normalizeSuite.heapUsedAfterGc, "number");
    }

    const parserSuite = payload.suites["parser-ast"];
    assert.ok(parserSuite && typeof parserSuite === "object");
    assert.equal(parserSuite.iterations, 1);
    assert.equal(typeof parserSuite.description, "string");
    assert.ok(parserSuite.description.toLowerCase().includes("parse"));
    assert.equal(typeof parserSuite.sample.path, "string");
    assert.ok(parserSuite.sample.path.endsWith("SnowState.gml"));
    assert.equal(typeof parserSuite.ast.nodeCount, "number");
    assert.ok(Array.isArray(parserSuite.ast.commonNodeTypes));
    assert.ok(parserSuite.memory && typeof parserSuite.memory === "object");
    assert.equal(typeof parserSuite.memory.delta.heapUsed, "number");

    const formatterSuite = payload.suites["plugin-format"];
    assert.ok(formatterSuite && typeof formatterSuite === "object");
    assert.equal(formatterSuite.iterations, 1);
    assert.equal(typeof formatterSuite.description, "string");
    assert.ok(formatterSuite.description.toLowerCase().includes("format"));
    assert.equal(typeof formatterSuite.sample.path, "string");
    assert.ok(formatterSuite.sample.path.endsWith("testFormatting.input.gml"));
    assert.equal(typeof formatterSuite.output.bytes, "number");
    assert.equal(typeof formatterSuite.options.printWidth, "number");
    assert.ok(
        formatterSuite.memory && typeof formatterSuite.memory === "object"
    );
    assert.equal(typeof formatterSuite.memory.delta.heapUsed, "number");
});
