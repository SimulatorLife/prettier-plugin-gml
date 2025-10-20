import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { normalizeStringList } from "./shared-deps.js";
import { applyStandardCommandOptions } from "./command-standard-options.js";
import {
    coercePositiveInteger,
    resolveIntegerOption,
    wrapInvalidArgumentResolver
} from "./command-parsing.js";
import { applyEnvOptionOverrides } from "./env-overrides.js";
import { applyEnvironmentOverride } from "./shared-deps.js";
import {
    SuiteOutputFormat,
    resolveSuiteOutputFormatOrThrow,
    emitSuiteResults as emitSuiteResultsJson,
    collectSuiteResults,
    ensureSuitesAreKnown,
    resolveRequestedSuites
} from "./command-suite-helpers.js";

export const DEFAULT_ITERATIONS = 500_000;
export const MEMORY_ITERATIONS_ENV_VAR = "GML_MEMORY_ITERATIONS";

let configuredDefaultMemoryIterations = DEFAULT_ITERATIONS;

const createIterationErrorMessage = (received) =>
    `Iteration count must be a positive integer (received ${received}).`;

const createIterationTypeErrorMessage = (type) =>
    `Iteration count must be provided as a number (received type '${type}').`;

function coerceMemoryIterations(value, { received }) {
    return coercePositiveInteger(value, {
        received,
        createErrorMessage: createIterationErrorMessage
    });
}

export function getDefaultMemoryIterations() {
    return configuredDefaultMemoryIterations;
}

export function setDefaultMemoryIterations(iterations) {
    if (iterations === undefined) {
        configuredDefaultMemoryIterations = DEFAULT_ITERATIONS;
        return configuredDefaultMemoryIterations;
    }

    configuredDefaultMemoryIterations = resolveMemoryIterations(iterations, {
        defaultIterations: DEFAULT_ITERATIONS
    });

    return configuredDefaultMemoryIterations;
}

export function resolveMemoryIterations(rawValue, { defaultIterations } = {}) {
    const fallback =
        defaultIterations === undefined
            ? getDefaultMemoryIterations()
            : defaultIterations;

    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: coerceMemoryIterations,
        typeErrorMessage: createIterationTypeErrorMessage
    });
}

export function applyMemoryIterationsEnvOverride(env = process?.env) {
    applyEnvironmentOverride({
        env,
        envVar: MEMORY_ITERATIONS_ENV_VAR,
        applyValue: setDefaultMemoryIterations
    });
}

export function applyMemoryEnvOptionOverrides({ command, env } = {}) {
    if (!command || typeof command.setOptionValueWithSource !== "function") {
        return;
    }

    applyEnvOptionOverrides({
        command,
        env,
        overrides: [
            {
                envVar: MEMORY_ITERATIONS_ENV_VAR,
                optionName: "iterations",
                resolveValue: resolveMemoryIterations
            }
        ]
    });
}

applyMemoryIterationsEnvOverride();

const AVAILABLE_SUITES = new Map();

function collectSuite(value, previous = []) {
    previous.push(value);
    return previous;
}

export function createMemoryCommand({ env = process.env } = {}) {
    const defaultIterations = getDefaultMemoryIterations();

    const command = applyStandardCommandOptions(
        new Command()
            .name("memory")
            .usage("[options]")
            .description("Run memory usage diagnostics for CLI utilities.")
    )
        .option(
            "-s, --suite <name>",
            "Memory suite to run (can be provided multiple times).",
            collectSuite,
            []
        )
        .option(
            "-i, --iterations <count>",
            `Iteration count for suites that support it (default: ${defaultIterations}).`,
            wrapInvalidArgumentResolver(resolveMemoryIterations),
            defaultIterations
        )
        .option(
            "--format <format>",
            "Output format: json (default) or human.",
            (value) =>
                resolveSuiteOutputFormatOrThrow(value, {
                    errorConstructor: InvalidArgumentError
                }),
            SuiteOutputFormat.JSON
        )
        .option("--pretty", "Pretty-print JSON output.");
    applyMemoryEnvOptionOverrides({ command, env });

    return command;
}

function collectSuiteOptions(options) {
    return {
        iterations: options.iterations
    };
}

function createCountingSet(originalSet, allocationCounter) {
    return class CountingSet extends originalSet {
        constructor(...args) {
            super(...args);
            allocationCounter.count += 1;
        }
    };
}

function runNormalizeStringListSuite({ iterations }) {
    if (typeof globalThis.gc !== "function") {
        throw new TypeError(
            "Run with --expose-gc to enable precise heap measurements."
        );
    }

    const originalSet = globalThis.Set;
    const allocationCounter = { count: 0 };
    const CountingSet = createCountingSet(originalSet, allocationCounter);

    globalThis.Set = CountingSet;

    try {
        const sampleValues = Array.from(
            { length: 64 },
            (_, index) => `value_${index % 16}`
        );
        const sampleString = sampleValues.join(", ");

        globalThis.gc();
        const before = process.memoryUsage().heapUsed;

        let totalLength = 0;
        for (let index = 0; index < iterations; index += 1) {
            const result = normalizeStringList(sampleString);
            totalLength += result.length;
        }

        const after = process.memoryUsage().heapUsed;

        globalThis.gc();
        const afterGc = process.memoryUsage().heapUsed;

        return {
            iterations,
            totalLength,
            heapUsedBefore: before,
            heapUsedAfter: after,
            heapDelta: after - before,
            heapUsedAfterGc: afterGc,
            heapDeltaAfterGc: afterGc - before,
            setAllocations: allocationCounter.count
        };
    } finally {
        globalThis.Set = originalSet;
    }
}

AVAILABLE_SUITES.set("normalize-string-list", runNormalizeStringListSuite);

function formatSuiteError(error) {
    return {
        name: error?.name ?? error?.constructor?.name ?? "Error",
        message:
            typeof error?.message === "string" ? error.message : String(error),
        stack:
            typeof error?.stack === "string"
                ? error.stack.split("\n")
                : undefined
    };
}

function printHumanReadable(results) {
    const lines = ["Memory benchmark results:"];
    for (const [suite, payload] of Object.entries(results)) {
        lines.push(`\n• ${suite}`);
        if (payload?.error) {
            lines.push(
                `  - error: ${payload.error.message ?? "Unknown error"}`
            );
            continue;
        }

        lines.push(`  - result: ${JSON.stringify(payload)}`);
    }

    console.log(lines.join("\n"));
}

export async function runMemoryCommand({ command } = {}) {
    const options = command?.opts?.() ?? {};

    const requestedSuites = resolveRequestedSuites(options, AVAILABLE_SUITES);
    ensureSuitesAreKnown(requestedSuites, AVAILABLE_SUITES, command);

    const suiteResults = await collectSuiteResults({
        suiteNames: requestedSuites,
        availableSuites: AVAILABLE_SUITES,
        runnerOptions: collectSuiteOptions(options),
        onError: (error) => ({ error: formatSuiteError(error) })
    });

    const emittedJson = emitSuiteResultsJson(suiteResults, options);
    if (!emittedJson) {
        printHumanReadable(suiteResults);
    }

    return 0;
}
