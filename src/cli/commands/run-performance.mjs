#!/usr/bin/env node
import { runPerformanceCli } from "../lib/performance-cli.js";

const exitCode = await runPerformanceCli();
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
