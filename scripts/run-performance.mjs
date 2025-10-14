#!/usr/bin/env node
import { runPerformanceCli } from "../src/cli/performance.js";

const exitCode = await runPerformanceCli();
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
