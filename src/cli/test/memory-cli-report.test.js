import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Keep these assertions on the `node:assert/strict` helpers to avoid Node.js'
// deprecated legacy equality APIs. Manual validation: run
// `node --test src/cli/test/memory-cli-report.test.js` to confirm behaviour
// parity with the previous implementation.

import {
    DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
    DEFAULT_MEMORY_REPORT_DIR,
    MEMORY_REPORT_DIRECTORY_ENV_VAR,
    runMemoryCli,
    setDefaultMemoryReportDirectory,
    setAstCommonNodeTypeLimit,
    MemorySuiteName
} from "../src/modules/memory/index.js";

test("memory CLI writes suite results to a JSON report", async (t) => {
    const workspace = await mkdtemp(
        path.join(os.tmpdir(), "memory-cli-report-")
    );
    const reportDir = path.join(workspace, "reports");

    t.after(() => {
        setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
    });

    const exitCode = await runMemoryCli({
        argv: ["--iterations", "1"],
        env: {},
        cwd: workspace,
        reportDir
    });

    assert.strictEqual(exitCode, 0);

    const reportPath = path.join(reportDir, "memory.json");
    const reportRaw = await readFile(reportPath, "utf8");
    const payload = JSON.parse(reportRaw);

    assert.strictEqual(typeof payload.environment, "object");
    assert.strictEqual(typeof payload.environment.nodeVersion, "string");
    assert.ok(payload.environment.nodeVersion.length > 0);
    assert.strictEqual(typeof payload.generatedAt, "string");
    assert.ok(payload.generatedAt.length > 0);
    assert.strictEqual(typeof payload.suites, "object");

    const normalizeSuite =
        payload.suites[MemorySuiteName.NORMALIZE_STRING_LIST];
    assert.ok(normalizeSuite && typeof normalizeSuite === "object");
    assert.strictEqual(normalizeSuite.iterations, 1);
    assert.strictEqual(typeof normalizeSuite.description, "string");
    assert.ok(!("error" in normalizeSuite));
    assert.strictEqual(typeof normalizeSuite.totalLength, "number");
    assert.strictEqual(typeof normalizeSuite.heapUsedBefore, "number");
    assert.strictEqual(typeof normalizeSuite.heapUsedAfter, "number");
    assert.ok(
        normalizeSuite.memory && typeof normalizeSuite.memory === "object"
    );
    assert.strictEqual(normalizeSuite.memory.unit, "bytes");
    assert.strictEqual(typeof normalizeSuite.memory.before.heapUsed, "number");
    assert.strictEqual(typeof normalizeSuite.memory.delta.heapUsed, "number");
    assert.strictEqual(
        typeof normalizeSuite.memory.deltaPerIteration,
        "object"
    );
    if (normalizeSuite.heapUsedAfterGc == null) {
        assert.ok(Array.isArray(normalizeSuite.warnings));
        assert.ok(
            normalizeSuite.warnings.some((warning) =>
                warning.includes("--expose-gc")
            )
        );
    } else {
        assert.strictEqual(typeof normalizeSuite.heapUsedAfterGc, "number");
    }

    const parserSuite = payload.suites[MemorySuiteName.PARSER_AST];
    assert.ok(parserSuite && typeof parserSuite === "object");
    assert.strictEqual(parserSuite.iterations, 1);
    assert.strictEqual(typeof parserSuite.description, "string");
    assert.ok(parserSuite.description.toLowerCase().includes("parse"));
    assert.strictEqual(typeof parserSuite.sample.path, "string");
    assert.ok(parserSuite.sample.path.endsWith("SnowState.gml"));
    assert.strictEqual(typeof parserSuite.ast.nodeCount, "number");
    assert.ok(Array.isArray(parserSuite.ast.commonNodeTypes));
    assert.ok(parserSuite.memory && typeof parserSuite.memory === "object");
    assert.strictEqual(typeof parserSuite.memory.delta.heapUsed, "number");

    const formatterSuite = payload.suites[MemorySuiteName.PLUGIN_FORMAT];
    assert.ok(formatterSuite && typeof formatterSuite === "object");
    assert.strictEqual(formatterSuite.iterations, 1);
    assert.strictEqual(typeof formatterSuite.description, "string");
    assert.ok(formatterSuite.description.toLowerCase().includes("format"));
    assert.strictEqual(typeof formatterSuite.sample.path, "string");
    assert.ok(formatterSuite.sample.path.endsWith("testFormatting.input.gml"));
    assert.strictEqual(typeof formatterSuite.output.bytes, "number");
    assert.strictEqual(typeof formatterSuite.options.printWidth, "number");
    assert.ok(
        formatterSuite.memory && typeof formatterSuite.memory === "object"
    );
    assert.strictEqual(typeof formatterSuite.memory.delta.heapUsed, "number");
});

test("memory CLI resolves report directory from the environment", async (t) => {
    const workspace = await mkdtemp(
        path.join(os.tmpdir(), "memory-cli-report-env-")
    );

    t.after(() => {
        setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
    });

    const env = { [MEMORY_REPORT_DIRECTORY_ENV_VAR]: "  env-reports  " };

    const exitCode = await runMemoryCli({
        argv: ["--iterations", "1"],
        env,
        cwd: workspace
    });

    assert.strictEqual(exitCode, 0);

    const reportPath = path.join(workspace, "env-reports", "memory.json");
    const reportRaw = await readFile(reportPath, "utf8");

    assert.strictEqual(typeof reportRaw, "string");
    assert.ok(reportRaw.length > 0);
});

test("memory CLI respects the common node limit option", async (t) => {
    const workspace = await mkdtemp(
        path.join(os.tmpdir(), "memory-cli-report-limit-")
    );
    const reportDir = path.join(workspace, "reports-limit");

    t.after(() => {
        setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
        setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);
    });

    setDefaultMemoryReportDirectory(DEFAULT_MEMORY_REPORT_DIR);
    setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);

    const exitCode = await runMemoryCli({
        argv: [
            "--suite",
            MemorySuiteName.PARSER_AST,
            "--iterations",
            "1",
            "--common-node-limit",
            "1"
        ],
        env: {},
        cwd: workspace,
        reportDir
    });

    assert.strictEqual(exitCode, 0);

    const reportPath = path.join(reportDir, "memory.json");
    const reportRaw = await readFile(reportPath, "utf8");
    const payload = JSON.parse(reportRaw);

    const parserSuite = payload.suites[MemorySuiteName.PARSER_AST];
    assert.ok(Array.isArray(parserSuite.ast.commonNodeTypes));
    assert.ok(parserSuite.ast.commonNodeTypes.length <= 1);
});
