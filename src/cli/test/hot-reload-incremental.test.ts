/**
 * Integration test for incremental transpilation with dependency tracking.
 *
 * Validates that when a file changes without changing its exported symbol set,
 * dependent files are not automatically retranspiled.
 */

import assert from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { waitForScanComplete } from "./test-helpers/status-polling.js";
import {
    connectToHotReloadWebSocket,
    type HotReloadScriptPatch,
    type WebSocketPatchStream
} from "./test-helpers/websocket-client.js";

void describe("Hot reload incremental transpilation", () => {
    let testDir: string;
    let baseFile: string;
    let dependentFile: string;
    let websocketContextPromise: Promise<WebSocketPatchStream> | null = null;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `test-incremental-${Date.now()}`);
        await mkdir(testDir, { recursive: true });

        // Create a base script that defines a function
        baseFile = path.join(testDir, "base_script.gml");
        await writeFile(
            baseFile,
            `function helper_function() {
    return 42;
}`,
            "utf8"
        );

        // Create a dependent script that calls the function from base_script
        dependentFile = path.join(testDir, "dependent_script.gml");
        await writeFile(
            dependentFile,
            `function use_helper() {
    var result = helper_function();
    return result;
}`,
            "utf8"
        );
    });

    after(async () => {
        const contextPromise = websocketContextPromise;
        websocketContextPromise = null;

        if (contextPromise !== null) {
            try {
                const context = await contextPromise;
                await context.disconnect();
            } catch {
                // Ignore cleanup failures; tests already handle connection lifecycle
            }
        }

        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should skip dependent retranspilation when definitions are unchanged", async () => {
        const websocketPort = await findAvailablePort();
        const statusPort = await findAvailablePort();
        const abortController = new AbortController();

        // Start the watch command
        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            quiet: true,
            websocketPort,
            websocketHost: "127.0.0.1",
            runtimeServer: false,
            statusServer: true,
            statusPort,
            abortSignal: abortController.signal
        });

        let context: WebSocketPatchStream | null = null;

        try {
            // Connect WebSocket client
            const contextPromise = connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`, {
                connectionTimeoutMs: 4000,
                retryIntervalMs: 25
            });
            websocketContextPromise = contextPromise;
            context = await contextPromise;

            await waitForScanComplete(`http://127.0.0.1:${statusPort}`, 5000, 25);

            const initialHelperCount = context.receivedPatches.filter((patch) =>
                patch.id.includes("helper_function")
            ).length;

            // Modify the base script
            await writeFile(
                baseFile,
                `function helper_function() {
    return 100;  // Changed from 42
}`,
                "utf8"
            );

            // Wait for transpilation and dependent file retranspilation
            await context.waitForPatches({
                timeoutMs: 2000,
                minCount: 1,
                predicate: (patch: HotReloadScriptPatch): patch is HotReloadScriptPatch =>
                    patch.id.includes("helper_function"),
                startCount: initialHelperCount
            });

            await delay(300);
        } finally {
            // Stop the watch command
            abortController.abort();

            if (context) {
                await context.disconnect();
            }

            try {
                await watchPromise;
            } catch {
                // Expected to be aborted
            }
        }

        // Verify that we received patches for the base file and no extra patch for the dependent file.
        // The base file should be transpiled because it changed.
        // The dependent file should not be retranspiled when symbol definitions stay the same.
        assert.ok(context, "WebSocket client should be connected");
        const basePatches = context.receivedPatches.filter((p) => p.id.includes("helper_function"));
        const dependentPatches = context.receivedPatches.filter((p) => p.id.includes("use_helper"));

        assert.ok(basePatches.length >= 2, "Should have received initial and updated patch for base_script");
        assert.strictEqual(
            dependentPatches.length,
            1,
            "Dependent script should only receive the initial patch when definitions are unchanged"
        );

        assert.ok(basePatches.length > 0, "Should record patches for helper_function");
        assert.ok(dependentPatches.length > 0, "Should record patches for use_helper");
    });
});
