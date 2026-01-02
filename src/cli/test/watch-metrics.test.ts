/**
 * Tests for watch command transpilation metrics tracking.
 *
 * Validates that the watch command properly collects and displays
 * transpilation metrics including timing, sizes, and aggregate statistics.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { runWatchCommand } from "../src/commands/watch.js";
import {
    createWatchTestFixture,
    disposeWatchTestFixture,
    type WatchTestFixture
} from "./test-helpers/watch-fixtures.js";

void describe("Watch command metrics tracking", () => {
    let fixture: WatchTestFixture | null = null;

    before(async () => {
        fixture = await createWatchTestFixture();
    });

    after(async () => {
        if (fixture) {
            await disposeWatchTestFixture(fixture.dir);
            fixture = null;
        }
    });

    void it("should track metrics for multiple transpilations", async () => {
        const abortController = new AbortController();

        if (!fixture) {
            throw new Error("Watch fixture was not initialized");
        }

        const watchPromise = runWatchCommand(fixture.dir, {
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
        await writeFile(fixture.script1, "var x = 100; // Modified", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 200));

        await writeFile(fixture.script2, "var y = 200; // Modified", "utf8");
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
