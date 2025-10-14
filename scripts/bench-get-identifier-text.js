#!/usr/bin/env node
import { runPerformanceCli } from "../src/cli/performance.js";

const exitCode = await runPerformanceCli({
    argv: ["--suite", "identifier-text"]
});
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
