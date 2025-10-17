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
    const state = createForwardingState();
    let index = 0;

    while (index < argv.length) {
        const arg = argv[index];
        if (isFlag(arg)) {
            index = processFlagArgument(argv, index, state);
        } else {
            processPositionalArgument(arg, state);
            index += 1;
        }
    }

    return finalizeForwardedArguments(state);
}

function createForwardingState() {
    return {
        forwardedArgs: ["--suite", "identifier-pipeline"],
        passthrough: [],
        projectInjected: false,
        fileInjected: false
    };
}

function isFlag(argument) {
    return argument.startsWith("-");
}

function processFlagArgument(argv, startIndex, state) {
    const arg = argv[startIndex];
    state.passthrough.push(arg);

    const nextIndex = startIndex + 1;
    if (shouldConsumeNextValue(arg, argv[nextIndex])) {
        state.passthrough.push(argv[nextIndex]);
        return nextIndex + 1;
    }

    return startIndex + 1;
}

function shouldConsumeNextValue(currentArg, nextArg) {
    if (nextArg === undefined) {
        return false;
    }

    return !currentArg.includes("=") && !nextArg.startsWith("-");
}

function processPositionalArgument(argument, state) {
    if (!state.projectInjected) {
        state.forwardedArgs.push("--project", argument);
        state.projectInjected = true;
        return;
    }

    if (!state.fileInjected) {
        state.forwardedArgs.push("--file", argument);
        state.fileInjected = true;
        return;
    }

    state.passthrough.push(argument);
}

function finalizeForwardedArguments(state) {
    return [...state.forwardedArgs, ...state.passthrough];
}

function applyExitCode(exitCode) {
    if (typeof exitCode === "number") {
        process.exitCode = exitCode;
    }
}

const forwardedArgs = buildForwardedArguments(argv);
const exitCode = await runPerformanceCli({ argv: forwardedArgs });
applyExitCode(exitCode);
