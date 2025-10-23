import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

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

        const exitCode = await runPerformanceCommand({ command });
        assert.equal(exitCode, 0);

        const rawReport = await readFile(reportFile, "utf8");
        const parsedReport = JSON.parse(rawReport);

        assert.equal(typeof parsedReport.generatedAt, "string");
        assert.ok(parsedReport.generatedAt.length > 0);
        assert.ok(parsedReport.suites);
        assert.ok(parsedReport.suites[PerformanceSuiteName.IDENTIFIER_TEXT]);
    });
});
