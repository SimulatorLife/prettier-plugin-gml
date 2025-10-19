#!/usr/bin/env node
import process from "node:process";

import { runPerformanceCli } from "../lib/performance-cli.js";

const argv = process.argv.slice(2);

/**
 * Build the argument list forwarded to the performance CLI by injecting the
 * project and file parameters before preserving any remaining passthrough
 * arguments.
 * @param {readonly string[]} argv
 * @returns {string[]}
 */
function buildForwardedArguments(argv) {
    const forwardedArgs = ["--suite", "identifier-pipeline"];
    const passthrough = [];
    let project;
    let file;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg.startsWith("-")) {
            passthrough.push(arg);
            const nextArg = argv[index + 1];
            if (
                nextArg !== undefined &&
                !arg.includes("=") &&
                typeof nextArg === "string" &&
                !nextArg.startsWith("-")
            ) {
                passthrough.push(nextArg);
                index += 1;
            }
            continue;
        }

        if (project === undefined) {
            project = arg;
            forwardedArgs.push("--project", arg);
            continue;
        }

        if (file === undefined) {
            file = arg;
            forwardedArgs.push("--file", arg);
            continue;
        }

        passthrough.push(arg);
    }

    return [...forwardedArgs, ...passthrough];
}

function applyExitCode(exitCode) {
    if (typeof exitCode === "number") {
        process.exitCode = exitCode;
    }
}

const forwardedArgs = buildForwardedArguments(argv);
const exitCode = await runPerformanceCli({ argv: forwardedArgs });
applyExitCode(exitCode);
