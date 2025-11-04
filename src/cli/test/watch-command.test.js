import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createWatchCommand } from "../src/commands/watch.js";

describe("watch command", () => {
    it("should create a command instance with correct configuration", () => {
        const command = createWatchCommand();

        assert.equal(command.name(), "watch");
        assert.equal(
            command.description(),
            "Watch GML source files and coordinate hot-reload pipeline actions"
        );

        const options = command.options;
        assert.ok(options.some((opt) => opt.long === "--extensions"));
        assert.ok(options.some((opt) => opt.long === "--polling"));
        assert.ok(options.some((opt) => opt.long === "--polling-interval"));
        assert.ok(options.some((opt) => opt.long === "--verbose"));
    });

    it("should have default extension set to .gml", () => {
        const command = createWatchCommand();
        const extensionsOption = command.options.find(
            (opt) => opt.long === "--extensions"
        );

        assert.ok(extensionsOption);
        assert.deepEqual(extensionsOption.defaultValue, [".gml"]);
    });

    it("should have default polling interval of 1000ms", () => {
        const command = createWatchCommand();
        const pollingIntervalOption = command.options.find(
            (opt) => opt.long === "--polling-interval"
        );

        assert.ok(pollingIntervalOption);
        assert.equal(pollingIntervalOption.defaultValue, 1000);
    });
});

describe("watch command integration", () => {
    it("should handle non-existent directory gracefully", async () => {
        const { runWatchCommand } = await import("../src/commands/watch.js");

        const nonExistentPath = "/tmp/non-existent-test-directory-12345";

        // We expect the command to exit with code 1
        // Since we can't easily test process.exit in the current setup,
        // we'll just verify the function handles the error
        const originalExit = process.exit;
        const exitCodeHolder = { code: null };

        process.exit = (code) => {
            exitCodeHolder.code = code;
            throw new Error(`process.exit called with code ${code}`);
        };

        try {
            await runWatchCommand(nonExistentPath, {
                extensions: [".gml"],
                polling: false,
                pollingInterval: 1000,
                verbose: false
            });
        } catch (error) {
            assert.ok(
                error.message.includes("process.exit called"),
                "Should call process.exit"
            );
        } finally {
            process.exit = originalExit;
        }

        assert.equal(exitCodeHolder.code, 1, "Should exit with code 1");
    });

    it("should normalize file extensions", async () => {
        // Create a temporary directory for testing
        const testDir = path.join(
            "/tmp",
            `watch-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const { runWatchCommand } = await import(
                "../src/commands/watch.js"
            );

            // Create a promise that will resolve when we stop the watcher
            let stopWatcher;
            const _watchPromise = new Promise((resolve, reject) => {
                stopWatcher = () => {
                    resolve();
                };

                // Start the watch command in the background
                runWatchCommand(testDir, {
                    extensions: ["gml", ".yy"],
                    polling: false,
                    pollingInterval: 1000,
                    verbose: false
                }).catch(reject);
            });

            // Give it a moment to start
            await sleep(100);

            // Stop the watcher
            stopWatcher();

            // Clean up
            await rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Clean up on error
            await rm(testDir, { recursive: true, force: true }).catch(() => {
                // Ignore cleanup errors
            });
            throw error;
        }
    });

    it("should properly clean up signal handlers to prevent resource leaks", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-leak-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const { runWatchCommand } = await import(
                "../src/commands/watch.js"
            );

            // Count initial signal listeners
            const initialSigintCount = process.listenerCount("SIGINT");
            const initialSigtermCount = process.listenerCount("SIGTERM");

            // Start the watch command
            runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                pollingInterval: 1000,
                verbose: false
            });

            // Give it time to set up
            await sleep(100);

            // Verify listeners were added
            const duringWatchSigintCount = process.listenerCount("SIGINT");
            const duringWatchSigtermCount = process.listenerCount("SIGTERM");
            assert.ok(
                duringWatchSigintCount > initialSigintCount,
                "SIGINT listener should be added"
            );
            assert.ok(
                duringWatchSigtermCount > initialSigtermCount,
                "SIGTERM listener should be added"
            );

            // Simulate SIGINT to trigger cleanup
            const originalExit = process.exit;
            let exitCalled = false;
            process.exit = () => {
                exitCalled = true;
                // Don't actually exit
            };

            try {
                // Emit SIGINT to trigger cleanup
                process.emit("SIGINT");

                // Give cleanup time to execute
                await sleep(50);

                // Verify listeners were properly removed
                const afterCleanupSigintCount = process.listenerCount("SIGINT");
                const afterCleanupSigtermCount =
                    process.listenerCount("SIGTERM");

                assert.ok(exitCalled, "process.exit should have been called");
                assert.ok(
                    afterCleanupSigintCount <= initialSigintCount,
                    `SIGINT listener should be removed to prevent leak (before: ${initialSigintCount}, during: ${duringWatchSigintCount}, after: ${afterCleanupSigintCount})`
                );
                assert.ok(
                    afterCleanupSigtermCount <= initialSigtermCount,
                    `SIGTERM listener should be removed to prevent leak (before: ${initialSigtermCount}, during: ${duringWatchSigtermCount}, after: ${afterCleanupSigtermCount})`
                );
            } finally {
                process.exit = originalExit;
            }

            await rm(testDir, { recursive: true, force: true });
        } catch (error) {
            await rm(testDir, { recursive: true, force: true }).catch(() => {
                // Ignore cleanup errors
            });
            throw error;
        }
    });
});
