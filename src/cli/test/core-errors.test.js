import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    CliUsageError,
    extractErrorExitCode,
    formatCliError,
    handleCliError,
    markAsCliUsageError,
    createCliErrorDetails
} from "../src/core/errors.js";

describe("cli error formatting", () => {
    it("omits stack traces and prefixes for usage errors", () => {
        const error = new CliUsageError("Missing project path");

        const output = formatCliError(error);

        assert.equal(output, "Missing project path");
    });

    it("recognizes branded usage errors even if renamed", () => {
        const error = new CliUsageError("Missing project path");
        error.name = "OtherCliError";

        const output = formatCliError(error);

        assert.equal(output, "Missing project path");
    });

    it("brands external error-like values", () => {
        const error = markAsCliUsageError({ message: "Missing project path" });

        const output = formatCliError(error);

        assert.equal(output, "Missing project path");
    });

    it("logs usage guidance without redundant prefixes", () => {
        const error = new CliUsageError("Missing project path", {
            usage: "Usage: prettier-wrapper [options] <path>"
        });
        const logged = [];
        const exitCodes = [];
        const restoreConsole = mock.method(console, "error", (...args) => {
            logged.push(args.join(" "));
        });
        const restoreExit = mock.method(process, "exit", (code) => {
            exitCodes.push(code);
        });

        try {
            handleCliError(error, { prefix: "Failed." });
        } finally {
            restoreConsole.mock.restore();
            restoreExit.mock.restore();
        }

        assert.deepEqual(logged, [
            "Missing project path\n\nUsage: prettier-wrapper [options] <path>"
        ]);
        assert.deepEqual(exitCodes, [1]);
    });

    it("includes prefixes for non-usage errors", () => {
        const error = new Error("Something exploded");
        const logged = [];
        const exitCodes = [];
        const restoreConsole = mock.method(console, "error", (...args) => {
            logged.push(args.join(" "));
        });
        const restoreExit = mock.method(process, "exit", (code) => {
            exitCodes.push(code);
        });

        try {
            handleCliError(error, { prefix: "Failed." });
        } finally {
            restoreConsole.mock.restore();
            restoreExit.mock.restore();
        }

        assert.equal(exitCodes.length, 1);
        assert.equal(exitCodes[0], 1);
        assert.equal(logged.length, 1);
        assert.ok(logged[0].startsWith("Failed.\nError: Something exploded"));
        assert.deepEqual(exitCodes, [1]);
    });
});

describe("cli error details", () => {
    it("normalizes message, name, code, and stack", () => {
        const error = new Error("kaboom");
        error.code = "ENOENT";

        const details = createCliErrorDetails(error);

        assert.equal(details.message, "kaboom");
        assert.equal(details.name, "Error");
        assert.equal(details.code, "ENOENT");
        assert.ok(Array.isArray(details.stack));
        assert.ok(details.stack.length > 0);
    });

    it("uses fallback metadata for non-error values", () => {
        const details = createCliErrorDetails(undefined, {
            fallbackMessage: "Something went wrong"
        });

        assert.equal(details.message, "Something went wrong");
        assert.equal(details.name, "Error");
        assert.equal(details.code, undefined);
        assert.equal(details.stack, undefined);
    });

    it("derives the error name from the @@toStringTag when missing", () => {
        const tagError = {
            message: "boom",
            [Symbol.toStringTag]: "DOMException"
        };

        const details = createCliErrorDetails(tagError);

        assert.equal(details.name, "DOMException");
    });
});

describe("extractErrorExitCode", () => {
    it("returns the exit code from an error object when it is a number", () => {
        const error = new Error("test error");
        error.exitCode = 42;

        const result = extractErrorExitCode(error);

        assert.equal(result, 42);
    });

    it("returns the default code when error has no exitCode property", () => {
        const error = new Error("test error");

        const result = extractErrorExitCode(error);

        assert.equal(result, 1);
    });

    it("returns the default code when error is null", () => {
        const result = extractErrorExitCode(null);

        assert.equal(result, 1);
    });

    it("returns the default code when error is undefined", () => {
        const result = extractErrorExitCode(undefined);

        assert.equal(result, 1);
    });

    it("returns the default code when exitCode is not a number", () => {
        const error = new Error("test error");
        error.exitCode = "not a number";

        const result = extractErrorExitCode(error);

        assert.equal(result, 1);
    });

    it("returns the default code when exitCode is null", () => {
        const error = new Error("test error");
        error.exitCode = null;

        const result = extractErrorExitCode(error);

        assert.equal(result, 1);
    });

    it("uses the custom default code when provided", () => {
        const error = new Error("test error");

        const result = extractErrorExitCode(error, 99);

        assert.equal(result, 99);
    });

    it("handles exit code of 0 correctly", () => {
        const error = new Error("test error");
        error.exitCode = 0;

        const result = extractErrorExitCode(error);

        assert.equal(result, 0);
    });
});
