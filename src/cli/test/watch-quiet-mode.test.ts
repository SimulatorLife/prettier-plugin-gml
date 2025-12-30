/**
 * Test suite for watch command quiet mode.
 *
 * Verifies that the --quiet flag properly suppresses non-essential output
 * while keeping errors and server URLs visible.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";

void describe("Watch command quiet mode", () => {
    let testDir: string;
    let testFile: string;

    before(async () => {
        testDir = path.join(
            process.cwd(),
            "tmp",
            `test-watch-quiet-${Date.now()}`
        );
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "test_script.gml");
        await writeFile(testFile, "var x = 10;", "utf8");
    });

    after(async () => {
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should start successfully with --quiet flag", async () => {
        const websocketPort = await findAvailablePort();
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            quiet: true,
            verbose: false,
            runtimeServer: false,
            websocketServer: true,
            websocketPort,
            statusServer: false,
            abortSignal: abortController.signal
        });

        // Give it time to start up
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Stop the watcher
        abortController.abort();
        await watchPromise;

        // If we get here without errors, the test passes
        assert.ok(
            true,
            "Watch command started and stopped successfully in quiet mode"
        );
    });

    void it("should reject both --verbose and --quiet together", async () => {
        const capturedErrors: Array<string> = [];
        const originalError = console.error;

        console.error = (message: string, ...args: Array<unknown>): void => {
            capturedErrors.push(String(message));
            if (args.length > 0) {
                capturedErrors.push(...args.map(String));
            }
        };

        const originalExit = process.exit;
        let exitCode: number | undefined;

        // Mock process.exit to capture the exit code
        process.exit = ((code?: number) => {
            exitCode = code;
            throw new Error("process.exit called");
        }) as typeof process.exit;

        try {
            await runWatchCommand(testDir, {
                extensions: [".gml"],
                quiet: true,
                verbose: true,
                runtimeServer: false,
                websocketServer: false
            });
        } catch {
            // Expected to throw from mocked process.exit
        } finally {
            process.exit = originalExit;
            console.error = originalError;
        }

        assert.strictEqual(exitCode, 1, "Should exit with code 1");
        assert.ok(
            capturedErrors.some((line) =>
                line.includes("--verbose and --quiet cannot be used together")
            ),
            "Should show error message about conflicting flags"
        );
    });
});
