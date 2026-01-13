/**
 * Integration test for incremental transpilation with dependency tracking.
 *
 * Validates that when a file changes, dependent files are automatically
 * retranspiled and patched.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";

void describe("Hot reload incremental transpilation", () => {
    let testDir: string;
    let baseFile: string;
    let dependentFile: string;
    let websocketClient;
    let receivedPatches: Array<{
        kind: string;
        id: string;
        js_body: string;
    }>;

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

        receivedPatches = [];
    });

    after(async () => {
        if (websocketClient) {
            await new Promise<void>((resolve) => {
                try {
                    websocketClient!.once("close", () => resolve());
                    websocketClient!.close();
                } catch {
                    resolve();
                }
            });
        }
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should retranspile dependent files when a dependency changes", async () => {
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
        await new Promise<void>((resolve, reject) => {
            websocketClient = new WebSocket(`ws://127.0.0.1:${websocketPort}`);

            websocketClient.on("open", () => {
                resolve();
            });

            websocketClient.on("error", (error) => {
                reject(
                    error instanceof Error
                        ? error
                        : new Error(`WebSocket error: ${error === undefined ? "unknown" : String(error)}`)
                );
            });

            websocketClient.on("message", (data) => {
                try {
                    const patch = JSON.parse(data.toString());
                    if (patch.kind === "script") {
                        receivedPatches.push(patch);
                    }
                } catch {
                    // Ignore parse errors in test
                }
            });
        });

        // Modify the base script
        await writeFile(
            baseFile,
            `function helper_function() {
    return 100;  // Changed from 42
}`,
            "utf8"
        );

        // Wait for transpilation and dependent file retranspilation
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Stop the watch command
        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected to be aborted
        }

        // Verify that we received patches for both the base file and the dependent file
        // The base file should be transpiled because it changed
        // The dependent file should be retranspiled because it depends on base_script
        const basePatches = receivedPatches.filter((p) => p.id.includes("base_script"));
        const dependentPatches = receivedPatches.filter((p) => p.id.includes("dependent_script"));

        assert.ok(basePatches.length > 0, "Should have received at least one patch for base_script");
        assert.ok(
            dependentPatches.length > 0,
            "Should have received at least one patch for dependent_script (retranspiled due to dependency)"
        );

        // Verify the base patch contains the updated value
        const latestBasePatch = basePatches.at(-1);
        assert.ok(
            latestBasePatch.js_body.includes("100") || latestBasePatch.js_body.includes("0x64"),
            "Base patch should contain the updated return value"
        );
    });
});
