#!/usr/bin/env node
import { runMemoryCli } from "../lib/memory-cli.js";

const exitCode = await runMemoryCli();
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
