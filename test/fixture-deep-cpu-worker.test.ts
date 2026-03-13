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
