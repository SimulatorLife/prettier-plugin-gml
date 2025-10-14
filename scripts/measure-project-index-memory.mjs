#!/usr/bin/env node
import process from "node:process";

import { runPerformanceCli } from "../src/cli/performance.js";

const exitCode = await runPerformanceCli({
    argv: ["--suite", "project-index-memory", ...process.argv.slice(2)]
});
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
