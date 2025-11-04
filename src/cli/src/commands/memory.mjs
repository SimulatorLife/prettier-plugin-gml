#!/usr/bin/env node
import { runMemoryCli } from "../modules/memory/index.js";
import { extractErrorExitCode, handleCliError } from "../core/errors.js";

try {
    const exitCode = await runMemoryCli();
    if (typeof exitCode === "number") {
        process.exitCode = exitCode;
    }
} catch (error) {
    handleCliError(error, {
        prefix: "Failed to run memory diagnostics.",
        exitCode: extractErrorExitCode(error)
    });
}
