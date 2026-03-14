import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

void test("fixture deep cpu worker writes an isolated cpuprofile artifact", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-fixture-deep-cpu-"));
    const outputPath = path.join(tempRoot, "format-test-draw-event.cpuprofile");

    try {
        await execFileAsync(process.execPath, [path.resolve(process.cwd(), "test/dist/fixture-deep-cpu-case.js")], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                GMLOOP_FIXTURE_DEEP_CPU: "0",
                GMLOOP_FIXTURE_DEEP_CPU_WORKSPACE: "format",
                GMLOOP_FIXTURE_DEEP_CPU_CASE_ID: "test-draw-event",
                GMLOOP_FIXTURE_DEEP_CPU_OUTPUT: outputPath
            },
            maxBuffer: 1024 * 1024 * 10
        });

        const cpuProfile = JSON.parse(await readFile(outputPath, "utf8")) as {
            nodes?: ReadonlyArray<unknown>;
            samples?: ReadonlyArray<number>;
        };
        assert.equal(Array.isArray(cpuProfile.nodes), true);
        assert.equal((cpuProfile.nodes?.length ?? 0) > 0, true);
        assert.equal(Array.isArray(cpuProfile.samples), true);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});

void test("fixture deep cpu worker supports batched case requests", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-fixture-deep-cpu-batch-"));
    const firstOutputPath = path.join(tempRoot, "format-test-draw-event-first.cpuprofile");
    const secondOutputPath = path.join(tempRoot, "format-test-draw-event-second.cpuprofile");

    try {
        const batchCases = JSON.stringify([
            {
                caseId: "test-draw-event",
                outputPath: firstOutputPath
            },
            {
                caseId: "test-draw-event",
                outputPath: secondOutputPath
            }
        ]);

        await execFileAsync(process.execPath, [path.resolve(process.cwd(), "test/dist/fixture-deep-cpu-case.js")], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                GMLOOP_FIXTURE_DEEP_CPU: "0",
                GMLOOP_FIXTURE_DEEP_CPU_WORKSPACE: "format",
                GMLOOP_FIXTURE_DEEP_CPU_CASES_JSON: batchCases
            },
            maxBuffer: 1024 * 1024 * 10
        });

        const firstCpuProfile = JSON.parse(await readFile(firstOutputPath, "utf8")) as {
            nodes?: ReadonlyArray<unknown>;
            samples?: ReadonlyArray<number>;
        };
        const secondCpuProfile = JSON.parse(await readFile(secondOutputPath, "utf8")) as {
            nodes?: ReadonlyArray<unknown>;
            samples?: ReadonlyArray<number>;
        };

        assert.equal(Array.isArray(firstCpuProfile.nodes), true);
        assert.equal((firstCpuProfile.nodes?.length ?? 0) > 0, true);
        assert.equal(Array.isArray(firstCpuProfile.samples), true);

        assert.equal(Array.isArray(secondCpuProfile.nodes), true);
        assert.equal((secondCpuProfile.nodes?.length ?? 0) > 0, true);
        assert.equal(Array.isArray(secondCpuProfile.samples), true);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
