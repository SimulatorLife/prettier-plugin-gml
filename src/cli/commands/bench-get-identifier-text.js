#!/usr/bin/env node
import { runPerformanceCli } from "../lib/performance-cli.js";

const exitCode = await runPerformanceCli({
    argv: ["--suite", "identifier-text"]
});
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
