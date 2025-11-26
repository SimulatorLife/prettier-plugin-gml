import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    CliUsageError,
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
        const { logged, exitCodes } = captureConsoleAndExit(() => {
            handleCliError(error, { prefix: "Failed." });
        });

        assert.deepEqual(logged, [
            "Missing project path\n\nUsage: prettier-wrapper [options] <path>"
        ]);
        assert.deepEqual(exitCodes, [1]);
    });

    it("includes prefixes for non-usage errors", () => {
        const error = new Error("Something exploded");
        const { logged, exitCodes } = captureConsoleAndExit(() => {
            handleCliError(error, { prefix: "Failed." });
        });

        assert.equal(exitCodes.length, 1);
        assert.equal(exitCodes[0], 1);
        assert.equal(logged.length, 1);
        assert.ok(logged[0].startsWith("Failed.\nError: Something exploded"));
        assert.deepEqual(exitCodes, [1]);
    });
});

describe("cli error details", () => {
    it("normalizes message, name, code, and stack", () => {
        const error: Error & { code?: string } = new Error("kaboom");
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

function captureConsoleAndExit(run) {
    const logged: string[] = [];
    const exitCodes: number[] = [];
    const restoreConsole = mock.method(console, "error", (...args) => {
        logged.push(args.join(" "));
    });
    const restoreExit = mock.method(process, "exit", (code) => {
        exitCodes.push(code);
    });

    try {
        run();
    } finally {
        restoreConsole.mock.restore();
        restoreExit.mock.restore();
    }

    return { logged, exitCodes };
}
