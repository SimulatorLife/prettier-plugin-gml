/**
 * Tests for the watch-status command.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWatchStatusCommand, runWatchStatusCommand } from "../src/commands/watch-status.js";

describe("watch-status command", () => {
    it("should create watch-status command with correct options", () => {
        const command = createWatchStatusCommand();

        assert.strictEqual(command.name(), "watch-status");
        assert.ok(command.description().includes("status server"));
    });

    it("should handle connection refused error gracefully", async () => {
        let errorThrown = false;
        const originalExit = process.exit;
        const originalConsoleError = console.error;

        // Capture console.error output
        const errorMessages: Array<string> = [];
        console.error = (...args: Array<unknown>) => {
            errorMessages.push(args.map(String).join(" "));
        };

        process.exit = ((code?: number) => {
            errorThrown = true;
            throw new Error(`Process exit: ${code ?? 0}`);
        }) as typeof process.exit;

        try {
            // Try to query a server that doesn't exist
            await runWatchStatusCommand({
                host: "127.0.0.1",
                port: 54_321 // unlikely to be in use
            });
        } catch {
            // Expected to throw when process.exit is called
        } finally {
            process.exit = originalExit;
            console.error = originalConsoleError;
        }

        assert.ok(errorThrown, "Should have attempted to exit");
        assert.ok(
            errorMessages.some((msg) => msg.includes("Failed to connect")),
            "Should show connection error"
        );
        assert.ok(
            errorMessages.some((msg) => msg.includes("Is the watch command running?")),
            "Should suggest watch command is not running"
        );
    });

    it("should accept format option", () => {
        const command = createWatchStatusCommand();
        const formatOption = command.options.find((opt) => opt.long === "--format");

        assert.ok(formatOption, "Should have --format option");
        assert.deepStrictEqual(formatOption?.argChoices, ["pretty", "json"]);
    });

    it("should accept endpoint option", () => {
        const command = createWatchStatusCommand();
        const endpointOption = command.options.find((opt) => opt.long === "--endpoint");

        assert.ok(endpointOption, "Should have --endpoint option");
        assert.deepStrictEqual(endpointOption?.argChoices, ["status", "health", "ping", "ready"]);
    });
});
