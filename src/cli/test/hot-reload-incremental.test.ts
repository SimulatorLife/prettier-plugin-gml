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

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { connectToHotReloadWebSocket, type WebSocketPatchStream } from "./test-helpers/websocket-client.js";

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
        const abortController = new AbortController();

        // Start the watch command
        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            quiet: true,
            websocketPort,
            websocketHost: "127.0.0.1",
            runtimeServer: false,
            statusServer: false,
            abortSignal: abortController.signal
        });

        // Wait for servers to start
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Connect WebSocket client
        const contextPromise = connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`);
        websocketContextPromise = contextPromise;
        const context = await contextPromise;

        // Modify the base script
        await writeFile(
            baseFile,
            `function helper_function() {
    return 100;  // Changed from 42
}`,
            "utf8"
        );

        // Wait for transpilation and potential dependent file retranspilation
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Stop the watch command
        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected to be aborted
        }

        // Verify that we received patches for the base file and no extra patch for the dependent file.
        // The base file should be transpiled because it changed.
        // The dependent file should not be retranspiled when symbol definitions stay the same.
        assert.ok(context, "WebSocket client should be connected");
        const basePatches = context.receivedPatches.filter((p) => p.id.includes("base_script"));
        const dependentPatches = context.receivedPatches.filter((p) => p.id.includes("dependent_script"));

        assert.ok(basePatches.length >= 2, "Should have received initial and updated patch for base_script");
        assert.strictEqual(
            dependentPatches.length,
            1,
            "Dependent script should only receive the initial patch when definitions are unchanged"
        );

        // Verify the base patch contains the updated value
        const latestBasePatch = basePatches.at(-1);
        assert.ok(
            latestBasePatch.js_body.includes("100") || latestBasePatch.js_body.includes("0x64"),
            "Base patch should contain the updated return value"
        );
    });
});
