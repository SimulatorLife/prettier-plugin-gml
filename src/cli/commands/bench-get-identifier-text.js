#!/usr/bin/env node
import {
    createPerformanceCommand,
    runPerformanceCommand
} from "../lib/performance-cli.js";

const command = createPerformanceCommand();
command.parse(["--suite", "identifier-text"], { from: "user" });

const exitCode = await runPerformanceCommand({ command });
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
