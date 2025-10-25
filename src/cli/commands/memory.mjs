#!/usr/bin/env node
import { runMemoryCli } from "../features/memory/index.js";
import { handleCliError } from "../core/errors.js";

try {
    const exitCode = await runMemoryCli();
    if (typeof exitCode === "number") {
        process.exitCode = exitCode;
    }
} catch (error) {
    handleCliError(error, {
        prefix: "Failed to run memory diagnostics.",
        exitCode: typeof error?.exitCode === "number" ? error.exitCode : 1
    });
}
