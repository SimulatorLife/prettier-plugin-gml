import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it, mock } from "node:test";

import { runPerformanceCommand } from "../features/performance/index.js";
import { PerformanceSuiteName } from "../features/performance/suite-options.js";

describe("performance CLI report output", () => {
    const disposals = [];

    after(async () => {
        await Promise.all(
            disposals
                .splice(0)
                .map((target) => rm(target, { recursive: true, force: true }))
        );
    });

    it("writes the JSON report to the requested path", async () => {
        const tempRoot = await mkdtemp(
            path.join(os.tmpdir(), "performance-cli-report-")
        );
        disposals.push(tempRoot);

        const reportFile = path.join(tempRoot, "report.json");

        const command = {
            opts: () => ({
                suite: [PerformanceSuiteName.IDENTIFIER_TEXT],
                iterations: 1,
                fixtureRoot: [],
                reportFile,
                skipReport: false,
                stdout: false,
                format: "json",
                pretty: true
            }),
            helpInformation: () => "usage"
        };

        const logMessages = [];
        const restoreLog = mock.method(console, "log", (...args) => {
            logMessages.push(args.join(" "));
        });

        try {
            const exitCode = await runPerformanceCommand({ command });
            assert.equal(exitCode, 0);
        } finally {
            restoreLog.mock.restore();
        }

        const rawReport = await readFile(reportFile, "utf8");
        const parsedReport = JSON.parse(rawReport);

        assert.equal(typeof parsedReport.generatedAt, "string");
        assert.ok(parsedReport.generatedAt.length > 0);
        assert.ok(parsedReport.suites);
        assert.ok(parsedReport.suites[PerformanceSuiteName.IDENTIFIER_TEXT]);

        const relativePath = path.relative(process.cwd(), reportFile);
        const expectedPath =
            relativePath &&
            !relativePath.startsWith("..") &&
            !path.isAbsolute(relativePath)
                ? relativePath
                : path.resolve(reportFile);

        assert.deepEqual(logMessages, [
            `Performance report written to ${expectedPath}.`
        ]);
    });

    it("keeps stdout clean when piping the report", async () => {
        const tempRoot = await mkdtemp(
            path.join(os.tmpdir(), "performance-cli-stdout-")
        );
        disposals.push(tempRoot);

        const reportFile = path.join(tempRoot, "report.json");

        const command = {
            opts: () => ({
                suite: [PerformanceSuiteName.IDENTIFIER_TEXT],
                iterations: 1,
                fixtureRoot: [],
                reportFile,
                skipReport: false,
                stdout: true,
                format: "json",
                pretty: false
            }),
            helpInformation: () => "usage"
        };

        const logMessages = [];
        const errorMessages = [];
        const writes = [];

        const restoreLog = mock.method(console, "log", (...args) => {
            logMessages.push(args.join(" "));
        });
        const restoreError = mock.method(console, "error", (...args) => {
            errorMessages.push(args.join(" "));
        });
        const restoreWrite = mock.method(process.stdout, "write", (chunk) => {
            writes.push(typeof chunk === "string" ? chunk : chunk.toString());
            return true;
        });

        try {
            const exitCode = await runPerformanceCommand({ command });
            assert.equal(exitCode, 0);
        } finally {
            restoreLog.mock.restore();
            restoreError.mock.restore();
            restoreWrite.mock.restore();
        }

        assert.deepEqual(logMessages, []);
        assert.equal(errorMessages.length, 1);

        const relativePath = path.relative(process.cwd(), reportFile);
        const expectedPath =
            relativePath &&
            !relativePath.startsWith("..") &&
            !path.isAbsolute(relativePath)
                ? relativePath
                : path.resolve(reportFile);

        assert.deepEqual(errorMessages, [
            `Performance report written to ${expectedPath}.`
        ]);

        const payload = writes.join("");
        assert.doesNotThrow(() => JSON.parse(payload));
    });
});
