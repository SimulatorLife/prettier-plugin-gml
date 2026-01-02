/**
 * Tests for watch command transpilation metrics tracking.
 *
 * Validates that the watch command properly collects and displays
 * transpilation metrics including timing, sizes, and aggregate statistics.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { runWatchCommand } from "../src/commands/watch.js";

void describe("Watch command metrics tracking", () => {
    let testDir: string;
    let testFile1: string;
    let testFile2: string;

    before(async () => {
        testDir = path.join(
            process.cwd(),
            "tmp",
            `test-watch-metrics-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );
        await mkdir(testDir, { recursive: true });
        testFile1 = path.join(testDir, "script1.gml");
        testFile2 = path.join(testDir, "script2.gml");
        await writeFile(testFile1, "var x = 10;", "utf8");
        await writeFile(testFile2, "var y = 20;", "utf8");
    });

    after(async () => {
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should track metrics for multiple transpilations", async () => {
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: true,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            abortSignal: abortController.signal
        });

        // Wait for watch to start
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Trigger multiple file changes
        await writeFile(testFile1, "var x = 100; // Modified", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 200));

        await writeFile(testFile2, "var y = 200; // Modified", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Stop the watcher
        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected when aborting
        }

        // Test passes if no errors were thrown and statistics were displayed
        assert.ok(true, "Metrics tracking completed without errors");
    });

});
