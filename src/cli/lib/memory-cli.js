import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { normalizeStringList } from "../../shared/utils/string.js";
import { applyStandardCommandOptions } from "./command-standard-options.js";
import { parseCommandLine, coercePositiveInteger } from "./command-parsing.js";
import { CliUsageError, handleCliError } from "./cli-errors.js";

const DEFAULT_ITERATIONS = 500_000;

const AVAILABLE_SUITES = new Map();

function collectSuite(value, previous = []) {
    previous.push(value);
    return previous;
}

function validateFormat(value) {
    const normalized = value?.toLowerCase();
    if (normalized === "json" || normalized === "human") {
        return normalized;
    }

    throw new InvalidArgumentError("Format must be either 'json' or 'human'.");
}

function parseIterationsOption(value) {
    return coercePositiveInteger(value, {
        createErrorMessage: (received) =>
            `Iteration count must be a positive integer (received ${received}).`
    });
}

function ensureSuitesAreKnown(suiteNames, command) {
    const unknownSuites = suiteNames.filter(
        (suite) => !AVAILABLE_SUITES.has(suite)
    );

    if (unknownSuites.length === 0) {
        return;
    }

    throw new CliUsageError(
        `Unknown suite${unknownSuites.length === 1 ? "" : "s"}: ${unknownSuites.join(", ")}.`,
        { usage: command.helpInformation() }
    );
}

function resolveRequestedSuites(options) {
    const hasExplicitSuites = options.suite.length > 0;
    const requested = hasExplicitSuites
        ? options.suite
        : [...AVAILABLE_SUITES.keys()];

    return requested.map((name) => name.toLowerCase());
}

function createMemoryCommand() {
    return applyStandardCommandOptions(
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
            `Iteration count for suites that support it (default: ${DEFAULT_ITERATIONS}).`,
            parseIterationsOption,
            DEFAULT_ITERATIONS
        )
        .option(
            "--format <format>",
            "Output format: json (default) or human.",
            validateFormat,
            "json"
        )
        .option("--pretty", "Pretty-print JSON output.");
}

function helpWasRequested(command, argv) {
    const { helpRequested } = parseCommandLine(command, argv);
    return helpRequested;
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

async function executeSuites(suites, options) {
    const results = {};
    for (const suiteName of suites) {
        const runner = AVAILABLE_SUITES.get(suiteName);
        if (!runner) {
            continue;
        }

        try {
            results[suiteName] = await runner(options);
        } catch (error) {
            results[suiteName] = {
                error: {
                    name: error?.name ?? error?.constructor?.name ?? "Error",
                    message:
                        typeof error?.message === "string"
                            ? error.message
                            : String(error),
                    stack:
                        typeof error?.stack === "string"
                            ? error.stack.split("\n")
                            : undefined
                }
            };
        }
    }

    return results;
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

function emitSuiteResults(results, options) {
    if (options.format === "json") {
        const payload = {
            generatedAt: new Date().toISOString(),
            suites: results
        };
        const spacing = options.pretty ? 2 : 0;
        process.stdout.write(`${JSON.stringify(payload, null, spacing)}\n`);
        return;
    }

    printHumanReadable(results);
}

async function main(argv = process.argv.slice(2)) {
    const command = createMemoryCommand();

    if (helpWasRequested(command, argv)) {
        return 0;
    }

    const options = command.opts();

    const requestedSuites = resolveRequestedSuites(options);
    ensureSuitesAreKnown(requestedSuites, command);

    const suiteResults = await executeSuites(
        requestedSuites,
        collectSuiteOptions(options)
    );

    emitSuiteResults(suiteResults, options);

    return 0;
}

export async function runMemoryCli({ argv = process.argv.slice(2) } = {}) {
    try {
        return await main(argv);
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to run memory diagnostics."
        });
        return 1;
    }
}

export { DEFAULT_ITERATIONS };
