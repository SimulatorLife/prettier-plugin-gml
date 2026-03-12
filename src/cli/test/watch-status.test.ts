/**
 * Tests for the watch-status command.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWatchStatusCommand, runWatchStatusCommand } from "../src/commands/watch-status.js";
import { withTemporaryProperty } from "./test-helpers/temporary-property.js";

void describe("watch-status command", () => {
    void it("should create watch-status command with correct options", () => {
        const command = createWatchStatusCommand();

        assert.strictEqual(command.name(), "watch-status");
        assert.ok(command.description().includes("status server"));
    });

    void it("should handle connection refused error gracefully", async () => {
        let errorThrown = false;

        const errorMessages: Array<string> = [];

        await withTemporaryProperty(
            console,
            "error",
            (...args: Array<unknown>) => {
                errorMessages.push(args.map(String).join(" "));
            },
            () =>
                withTemporaryProperty(
                    process,
                    "exit",
                    ((code?: number) => {
                        errorThrown = true;
                        throw new Error(`Process exit: ${code ?? 0}`);
                    }) as typeof process.exit,
                    async () => {
                        try {
                            await runWatchStatusCommand({
                                statusHost: "127.0.0.1",
                                statusPort: 54_321 // unlikely to be in use
                            });
                        } catch {
                            // Expected to throw when process.exit is called
                        }
                    }
                )
        );

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

    void it("should accept format option", () => {
        const command = createWatchStatusCommand();
        const formatOption = command.options.find((opt) => opt.long === "--format");

        assert.ok(formatOption, "Should have --format option");
        assert.deepStrictEqual(formatOption?.argChoices, ["pretty", "json"]);
    });

    void it("should accept endpoint option", () => {
        const command = createWatchStatusCommand();
        const endpointOption = command.options.find((opt) => opt.long === "--endpoint");

        assert.ok(endpointOption, "Should have --endpoint option");
        assert.deepStrictEqual(endpointOption?.argChoices, ["status", "health", "ping", "ready"]);
    });

    void it("should have --status-port option matching watch command naming", () => {
        const command = createWatchStatusCommand();
        const portOption = command.options.find((opt) => opt.long === "--status-port");

        assert.ok(portOption, "Should have --status-port option (not --port) to match watch --status-port");
        assert.strictEqual(portOption?.envVar, "WATCH_STATUS_PORT");
    });

    void it("should have --status-host option matching watch command naming", () => {
        const command = createWatchStatusCommand();
        const hostOption = command.options.find((opt) => opt.long === "--status-host");

        assert.ok(hostOption, "Should have --status-host option (not --host) to match watch --status-host");
        assert.strictEqual(hostOption?.envVar, "WATCH_STATUS_HOST");
    });
});
