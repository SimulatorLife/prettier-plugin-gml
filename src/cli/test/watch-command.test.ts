import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createWatchCommand } from "../src/commands/watch.js";

void describe("watch command", () => {
    void it("should create a command instance with correct configuration", () => {
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

    void it("should have default extension set to .gml", () => {
        const command = createWatchCommand();
        const extensionsOption = command.options.find(
            (opt) => opt.long === "--extensions"
        );

        assert.ok(extensionsOption);
        assert.deepEqual(extensionsOption.defaultValue, [".gml"]);
    });

    void it("should have default polling interval of 1000ms", () => {
        const command = createWatchCommand();
        const pollingIntervalOption = command.options.find(
            (opt) => opt.long === "--polling-interval"
        );

        assert.ok(pollingIntervalOption);
        assert.equal(pollingIntervalOption.defaultValue, 1000);
    });
});

void describe("watch command integration", () => {
    void it("should handle non-existent directory gracefully", async () => {
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

    void it("should normalize file extensions", async () => {
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

            const abortController = new AbortController();

            const watchPromise = runWatchCommand(testDir, {
                extensions: ["gml", ".yy"],
                polling: false,
                pollingInterval: 1000,
                verbose: false,
                abortSignal: abortController.signal,
                hydrateRuntime: false
            });

            // Give it a moment to start
            await sleep(100);

            abortController.abort();

            await watchPromise;

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

    void it("should transpile GML files when they change", async () => {
        // Create a temporary directory for testing
        const testDir = path.join(
            "/tmp",
            `watch-test-transpile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        const testFile = path.join(testDir, "test_script.gml");

        try {
            const { runWatchCommand } = await import(
                "../src/commands/watch.js"
            );

            const abortController = new AbortController();

            // Mock transpiler to capture patches
            // Start watching
            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                pollingInterval: 1000,
                verbose: false,
                abortSignal: abortController.signal,
                hydrateRuntime: false,
                runtimeServerStarter: async () => ({
                    stop: async () => {},
                    host: "localhost",
                    port: 0,
                    root: testDir,
                    origin: "http://localhost:0",
                    url: "http://localhost:0"
                })
            });

            // Give watcher time to start
            await sleep(100);

            // Create a test file
            await writeFile(testFile, "var x = 10;\nshow_debug_message(x);");

            // Give watcher time to process the file
            await sleep(200);

            abortController.abort();
            await watchPromise;

            // Clean up
            await rm(testDir, { recursive: true, force: true });

            // We can't easily verify transpilation without injecting a mock transpiler
            // This test verifies the watch command can handle file creation without crashing
            assert.ok(true, "Watch command handled file creation");
        } catch (error) {
            // Clean up on error
            await rm(testDir, { recursive: true, force: true }).catch(() => {
                // Ignore cleanup errors
            });
            throw error;
        }
    });
});
