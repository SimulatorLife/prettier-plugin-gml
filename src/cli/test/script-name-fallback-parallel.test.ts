/**
 * Integration test for script name fallback registration under parallel file processing.
 *
 * Regression test for the race condition in `addScriptNamesFromFile` where the
 * `beforeSize` sentinel was captured before `await readFile`.  When multiple
 * files are processed concurrently, other files can add symbols between the
 * sentinel capture and the final size check, causing the fallback name for a
 * file that failed to parse to be silently dropped from the semantic oracle.
 *
 * When a script name is missing from the oracle, calls to that script are
 * emitted as bare `fn()` calls instead of hot-dispatch
 * `__call_script("gml/script/fn", self, other, [])` invocations.  This test
 * verifies that the fallback is always registered regardless of concurrency.
 */

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { waitForScanComplete } from "./test-helpers/status-polling.js";
import { connectToHotReloadWebSocket, type WebSocketPatchStream } from "./test-helpers/websocket-client.js";

void describe("script name fallback registration under parallel file processing", () => {
    let testDir: string;
    let callerFile: string;
    let wsContext: WebSocketPatchStream | null = null;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `test-fallback-${Date.now()}`);
        // GameMaker script files live under a "scripts/" directory; the runtime-identifier
        // helpers only derive a script name for paths that contain this segment.
        const scriptsDir = path.join(testDir, "scripts");
        await mkdir(scriptsDir, { recursive: true });

        // Create enough valid GML files to ensure concurrent processing via runInParallel.
        // Their symbols are added to the scriptNames Set while broken_script.gml is
        // suspended waiting for its own readFile, which previously invalidated the
        // beforeSize sentinel.
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                writeFile(
                    path.join(scriptsDir, `valid_script_${i}.gml`),
                    `function valid_func_${i}() { return ${i}; }`,
                    "utf8"
                )
            )
        );

        // This file has a syntax error – it will never parse successfully.
        // Its script name "broken_script" must still reach the semantic oracle
        // via the filename-based fallback path.
        await writeFile(path.join(scriptsDir, "broken_script.gml"), "{ INVALID GML SYNTAX !!!", "utf8");

        // Initial version of the caller; a simple function that doesn't call broken_script yet.
        callerFile = path.join(scriptsDir, "caller_script.gml");
        await writeFile(callerFile, `function caller_func() { return 0; }`, "utf8");
    });

    after(async () => {
        const context = wsContext;
        wsContext = null;
        try {
            await context?.disconnect();
        } catch {
            // Ignore cleanup failures
        }
        await rm(testDir, { recursive: true, force: true });
    });

    void it("emits a hot-dispatch call for a script whose file failed to parse", async () => {
        const websocketPort = await findAvailablePort();
        const statusPort = await findAvailablePort();
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            websocketPort,
            websocketHost: "127.0.0.1",
            statusPort,
            statusServer: true,
            runtimeServer: false,
            quiet: true,
            abortSignal: abortController.signal
        });

        try {
            const newContext = await connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`, {
                connectionTimeoutMs: 4000,
                retryIntervalMs: 25
            });
            wsContext = newContext;

            // Wait for the initial scan to finish so the semantic oracle is fully seeded.
            await waitForScanComplete(`http://127.0.0.1:${statusPort}`, 8000, 25);

            // Remember the current patch count before triggering the change so we
            // can use waitForPatches with a startCount offset.
            const patchCountBefore = wsContext.receivedPatches.length;

            // Rewrite the caller to invoke broken_script() – a script whose file
            // cannot be parsed but whose name should still be in the oracle.
            await writeFile(
                callerFile,
                `function caller_func() { var result = broken_script(); return result; }`,
                "utf8"
            );

            const newPatches = await wsContext.waitForPatches({
                minCount: 1,
                startCount: patchCountBefore,
                timeoutMs: 10_000
            });

            // Find the patch for caller_script (it is the file we just changed).
            const callerPatch = newPatches.find((p) => p.id.includes("caller_script") || p.id.includes("caller"));
            assert.ok(
                callerPatch,
                `Expected a patch for caller_script, got: ${JSON.stringify(newPatches.map((p) => p.id))}`
            );

            // If broken_script is absent from the oracle the transpiler emits a bare call:
            //   broken_script()
            // With the fix it should emit the hot-dispatch form:
            //   __call_script("gml/script/broken_script", self, other, [])
            assert.ok(
                callerPatch.js_body.includes("__call_script"),
                `Expected hot-dispatch call for broken_script but got:\n${callerPatch.js_body}`
            );
        } finally {
            abortController.abort();
            try {
                await watchPromise;
            } catch {
                // Expected when the signal fires
            }
        }
    });
});
