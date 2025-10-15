#!/usr/bin/env node
import process from "node:process";

import { runPerformanceCli } from "../src/cli/performance.js";

const argv = process.argv.slice(2);

const forwardedArgs = ["--suite", "identifier-pipeline"];
const passthrough = [];
let projectInjected = false;
let fileInjected = false;

for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
        if (!projectInjected) {
            forwardedArgs.push("--project", arg);
            projectInjected = true;
        } else if (fileInjected) {
            passthrough.push(arg);
        } else {
            forwardedArgs.push("--file", arg);
            fileInjected = true;
        }
        continue;
    }

    passthrough.push(arg);

    if (
        !arg.includes("=") &&
        index + 1 < argv.length &&
        !argv[index + 1].startsWith("-")
    ) {
        index += 1;
        passthrough.push(argv[index]);
    }
}

forwardedArgs.push(...passthrough);

const exitCode = await runPerformanceCli({ argv: forwardedArgs });
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
