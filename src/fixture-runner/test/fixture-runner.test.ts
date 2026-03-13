import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FixtureRunner } from "@gmloop/fixture-runner";

async function createTextFixtureCase(rootPath: string, caseId: string, config: Record<string, unknown>, input: string, expected?: string) {
    const casePath = path.join(rootPath, caseId);
    await mkdir(casePath, { recursive: true });
    await writeFile(path.join(casePath, "gmloop.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(path.join(casePath, "input.gml"), input, "utf8");
    if (expected !== undefined) {
        await writeFile(path.join(casePath, "expected.gml"), expected, "utf8");
    }
}

void test("loadFixtureProjectConfig validates fixture metadata", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fixture-runner-config-"));
    const configPath = path.join(rootPath, "gmloop.json");
    await writeFile(
        configPath,
        `${JSON.stringify({ fixture: { kind: "format", profile: { budgets: { durationMs: { total: 100 } } } } }, null, 2)}\n`,
        "utf8"
    );

    try {
        const config = await FixtureRunner.loadFixtureProjectConfig(configPath);
        assert.equal(config.fixture.kind, "format");
        assert.deepEqual(config.fixture.profile?.budgets?.durationMs, { total: 100 });
    } finally {
        await rm(rootPath, { recursive: true, force: true });
    }
});

void test("discoverFixtureCases normalizes directory-per-case fixtures", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fixture-runner-discovery-"));
    await createTextFixtureCase(
        rootPath,
        "example",
        {
            fixture: {
                kind: "format"
            }
        },
        "var value = 1;\n",
        "var value = 1;\n"
    );

    try {
        const fixtureCases = await FixtureRunner.discoverFixtureCases(rootPath);
        assert.equal(fixtureCases.length, 1);
        assert.equal(fixtureCases[0]?.caseId, "example");
        assert.equal(fixtureCases[0]?.assertion, "transform");
    } finally {
        await rm(rootPath, { recursive: true, force: true });
    }
});

void test("runFixtureSuite records profiling metrics and writes reports", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "fixture-runner-suite-"));
    const reportPath = path.join(rootPath, "fixture-profile.json");
    await createTextFixtureCase(
        rootPath,
        "example",
        {
            fixture: {
                kind: "format"
            }
        },
        "input\n",
        "output\n"
    );

    try {
        const collector = FixtureRunner.createProfileCollector();
        const result = await FixtureRunner.runFixtureSuite({
            fixtureRoot: rootPath,
            adapter: {
                workspaceName: "format",
                suiteName: "format fixtures",
                supports(kind) {
                    return kind === "format";
                },
                async run({ runProfiledStage }) {
                    return await runProfiledStage("format", async () => ({
                        resultKind: "text",
                        outputText: "output\n",
                        changed: true
                    }));
                }
            },
            profileCollector: collector
        });

        assert.equal(result.executionResults.length, 1);
        const report = collector.createReport();
        assert.equal(report.entries.length, 1);
        assert.equal(report.entries[0]?.stages.some((stage) => stage.stageName === "format"), true);
        await FixtureRunner.writeJsonProfileReport(report, reportPath);
        const persisted = JSON.parse(await readFile(reportPath, "utf8")) as { entries: Array<unknown> };
        assert.equal(persisted.entries.length, 1);
        assert.match(FixtureRunner.renderHumanProfileReport(report), /Slowest cases:/u);
    } finally {
        await rm(rootPath, { recursive: true, force: true });
    }
});
