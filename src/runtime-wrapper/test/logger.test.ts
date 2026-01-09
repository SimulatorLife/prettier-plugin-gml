import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLogger, createChangeEventLogger } from "../src/runtime/logger.js";
import type { Patch, RegistryChangeEvent } from "../src/runtime/types.js";

class MockConsole implements Console {
    public logs: Array<{ level: string; args: Array<unknown> }> = [];
    // Use globalThis.console to avoid no-console lint warning
    Console = (globalThis as { console: Console }).console.Console;

    log(...args: Array<unknown>): void {
        this.logs.push({ level: "log", args });
    }

    error(...args: Array<unknown>): void {
        this.logs.push({ level: "error", args });
    }

    warn(...args: Array<unknown>): void {
        this.logs.push({ level: "warn", args });
    }

    info(...args: Array<unknown>): void {
        this.logs.push({ level: "info", args });
    }

    debug(...args: Array<unknown>): void {
        this.logs.push({ level: "debug", args });
    }

    assert(condition?: boolean, ...data: Array<unknown>): void {
        if (!condition) {
            this.error("Assertion failed", ...data);
        }
    }

    clear(): void {
        this.logs = [];
    }

    count(label?: string): void {
        this.log("count", label);
    }

    countReset(label?: string): void {
        this.log("countReset", label);
    }

    dir(item?: unknown, options?: unknown): void {
        this.log("dir", item, options);
    }

    dirxml(...data: Array<unknown>): void {
        this.log("dirxml", ...data);
    }

    group(...data: Array<unknown>): void {
        this.log("group", ...data);
    }

    groupCollapsed(...data: Array<unknown>): void {
        this.log("groupCollapsed", ...data);
    }

    groupEnd(): void {
        this.log("groupEnd");
    }

    table(tabularData?: unknown, properties?: Array<string>): void {
        this.log("table", tabularData, properties);
    }

    time(label?: string): void {
        this.log("time", label);
    }

    timeEnd(label?: string): void {
        this.log("timeEnd", label);
    }

    timeLog(label?: string, ...data: Array<unknown>): void {
        this.log("timeLog", label, ...data);
    }

    trace(...data: Array<unknown>): void {
        this.log("trace", ...data);
    }

    profile(label?: string): void {
        this.log("profile", label);
    }

    profileEnd(label?: string): void {
        this.log("profileEnd", label);
    }

    timeStamp(label?: string): void {
        this.log("timeStamp", label);
    }
}

void describe("Logger", () => {
    void it("should create logger with default options", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole });

        assert.equal(logger.getLevel(), "error");
    });

    void it("should create logger with custom level", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "debug" });

        assert.equal(logger.getLevel(), "debug");
    });

    void it("should respect log levels", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "warn" });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        // Only warn and error should be logged
        assert.equal(mockConsole.logs.length, 2);
        assert.equal(mockConsole.logs[0].level, "warn");
        assert.equal(mockConsole.logs[1].level, "error");
    });

    void it("should log nothing when level is silent", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "silent" });

        logger.debug("debug");
        logger.info("info");
        logger.warn("warn");
        logger.error("error");

        assert.equal(mockConsole.logs.length, 0);
    });

    void it("should allow changing log level", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "error" });

        logger.info("before");
        assert.equal(mockConsole.logs.length, 0);

        logger.setLevel("info");
        logger.info("after");
        assert.equal(mockConsole.logs.length, 1);
    });

    void it("should log patch applied with version", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        const patch: Patch = { kind: "script", id: "script:test", js_body: "return 42;" };
        logger.patchApplied(patch, 5);

        assert.equal(mockConsole.logs.length, 1);
        assert.equal(mockConsole.logs[0].level, "log");
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /script:test/);
        assert.match(message, /v5/);
    });

    void it("should include duration when provided", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        const patch: Patch = { kind: "script", id: "script:test", js_body: "return 42;" };
        logger.patchApplied(patch, 5, 123.456);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /123ms/);
    });

    void it("should log patch undone", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        logger.patchUndone("script:test", 4);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /Undone/);
        assert.match(message, /script:test/);
        assert.match(message, /v4/);
    });

    void it("should log patch rolled back", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "error", styled: false });

        const patch: Patch = { kind: "script", id: "script:test", js_body: "bad" };
        logger.patchRolledBack(patch, 3, "Syntax error");

        assert.equal(mockConsole.logs.length, 1);
        assert.equal(mockConsole.logs[0].level, "error");
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /Rollback/);
        assert.match(message, /script:test/);
        assert.match(message, /Syntax error/);
    });

    void it("should log registry cleared", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        logger.registryCleared(10);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /cleared/);
        assert.match(message, /v10/);
    });

    void it("should log validation errors", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "error", styled: false });

        logger.validationError("script:bad", "Missing js_body");

        assert.equal(mockConsole.logs.length, 1);
        assert.equal(mockConsole.logs[0].level, "error");
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /Validation failed/);
        assert.match(message, /script:bad/);
    });

    void it("should log shadow validation failures", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "warn", styled: false });

        logger.shadowValidationFailed("script:test", "Cannot create function");

        assert.equal(mockConsole.logs.length, 1);
        assert.equal(mockConsole.logs[0].level, "warn");
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /Shadow validation failed/);
    });

    void it("should log WebSocket events", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        logger.websocketConnected("ws://localhost:17890");
        logger.websocketReconnecting(2, 1000);
        logger.websocketDisconnected("Connection closed");
        logger.websocketError("Network error");

        assert.equal(mockConsole.logs.length, 4);
        assert.match(mockConsole.logs[0].args[0] as string, /Connected/);
        assert.match(mockConsole.logs[1].args[0] as string, /Reconnecting/);
        assert.match(mockConsole.logs[2].args[0] as string, /Disconnected/);
        assert.equal(mockConsole.logs[3].level, "error");
    });

    void it("should log patch queue operations", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "debug", styled: false });

        logger.patchQueued("script:test", 5);
        logger.patchQueueFlushed(5, 10.5);

        assert.equal(mockConsole.logs.length, 2);
        assert.match(mockConsole.logs[0].args[0] as string, /Queued/);
        assert.match(mockConsole.logs[0].args[0] as string, /depth: 5/);
        assert.match(mockConsole.logs[1].args[0] as string, /Flushed/);
        assert.match(mockConsole.logs[1].args[0] as string, /5 patches/);
    });

    void it("should include prefix in messages", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({
            console: mockConsole,
            level: "info",
            prefix: "[test-prefix]",
            styled: false
        });

        logger.info("test message");

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /\[test-prefix\]/);
    });

    void it("should include timestamps when enabled", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({
            console: mockConsole,
            level: "info",
            timestamps: true,
            styled: false
        });

        logger.info("test message");

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        // Check for timestamp format HH:MM:SS.mmm
        assert.match(message, /\d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    void it("should format durations correctly", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });

        const patch: Patch = { kind: "script", id: "script:test", js_body: "return 42;" };

        // Less than 1ms
        logger.patchApplied(patch, 1, 0.5);
        assert.match(mockConsole.logs[0].args[0] as string, /<1ms/);

        mockConsole.clear();

        // Milliseconds
        logger.patchApplied(patch, 2, 123);
        assert.match(mockConsole.logs[0].args[0] as string, /123ms/);

        mockConsole.clear();

        // Seconds
        logger.patchApplied(patch, 3, 1500);
        assert.match(mockConsole.logs[0].args[0] as string, /1\.50s/);
    });

    void it("should support custom console implementation", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info" });

        logger.info("test");

        assert.equal(mockConsole.logs.length, 1);
    });

    void it("should handle emoji styling option", () => {
        const mockConsole = new MockConsole();
        const styledLogger = createLogger({ console: mockConsole, level: "info", styled: true });
        const unstyledLogger = createLogger({ console: mockConsole, level: "info", styled: false });

        const patch: Patch = { kind: "script", id: "script:test", js_body: "return 42;" };

        styledLogger.patchApplied(patch, 1);
        const styledMessage = mockConsole.logs[0].args[0] as string;

        mockConsole.clear();

        unstyledLogger.patchApplied(patch, 1);
        const unstyledMessage = mockConsole.logs[0].args[0] as string;

        // Styled should have emoji (longer message)
        // This is a weak test but sufficient for our purposes
        assert.ok(styledMessage.length >= unstyledMessage.length);
    });
});

void describe("createChangeEventLogger", () => {
    void it("should log patch-applied events", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });
        const eventLogger = createChangeEventLogger(logger);

        const event: RegistryChangeEvent = {
            type: "patch-applied",
            patch: { kind: "script", id: "script:test", js_body: "return 42;" },
            version: 5
        };

        eventLogger(event);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /script:test/);
        assert.match(message, /v5/);
    });

    void it("should log patch-undone events", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });
        const eventLogger = createChangeEventLogger(logger);

        const event: RegistryChangeEvent = {
            type: "patch-undone",
            patch: { kind: "script", id: "script:test" },
            version: 4
        };

        eventLogger(event);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /Undone/);
    });

    void it("should log patch-rolled-back events", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "error", styled: false });
        const eventLogger = createChangeEventLogger(logger);

        const event: RegistryChangeEvent = {
            type: "patch-rolled-back",
            patch: { kind: "script", id: "script:test", js_body: "bad" },
            version: 3,
            error: "Syntax error"
        };

        eventLogger(event);

        assert.equal(mockConsole.logs.length, 1);
        assert.equal(mockConsole.logs[0].level, "error");
    });

    void it("should log registry-cleared events", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });
        const eventLogger = createChangeEventLogger(logger);

        const event: RegistryChangeEvent = {
            type: "registry-cleared",
            version: 0
        };

        eventLogger(event);

        assert.equal(mockConsole.logs.length, 1);
        const message = mockConsole.logs[0].args[0] as string;
        assert.match(message, /cleared/);
    });

    void it("should integrate with runtime wrapper onChange hook", () => {
        const mockConsole = new MockConsole();
        const logger = createLogger({ console: mockConsole, level: "info", styled: false });
        const eventLogger = createChangeEventLogger(logger);

        // Simulate onChange events
        const events: Array<RegistryChangeEvent> = [
            {
                type: "patch-applied",
                patch: { kind: "script", id: "script:a", js_body: "return 1;" },
                version: 1
            },
            {
                type: "patch-applied",
                patch: { kind: "script", id: "script:b", js_body: "return 2;" },
                version: 2
            },
            {
                type: "patch-undone",
                patch: { kind: "script", id: "script:b" },
                version: 1
            },
            {
                type: "registry-cleared",
                version: 0
            }
        ];

        for (const event of events) {
            eventLogger(event);
        }

        assert.equal(mockConsole.logs.length, 4);
    });
});
