import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    CliUsageError,
    formatCliError,
    handleCliError,
    markAsCliUsageError,
    createCliErrorDetails
} from "../lib/cli-errors.js";

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

    it("logs usage guidance without stack traces", () => {
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
            "Failed.\nMissing project path\n\nUsage: prettier-wrapper [options] <path>"
        ]);
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
});
