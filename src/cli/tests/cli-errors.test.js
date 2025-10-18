import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    CliUsageError,
    formatCliError,
    handleCliError
} from "../lib/cli-errors.js";

describe("cli error formatting", () => {
    it("omits stack traces and prefixes for usage errors", () => {
        const error = new CliUsageError("Missing project path");

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
