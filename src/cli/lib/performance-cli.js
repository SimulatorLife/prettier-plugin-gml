import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { applyStandardCommandOptions } from "./command-standard-options.js";
import {
    resolveCliProjectIndexBuilder,
    resolveCliIdentifierCasePlanPreparer
} from "./plugin-services.js";
import {
    getIdentifierText,
    toNormalizedLowerCaseString
} from "./shared-deps.js";
import { formatByteSize } from "./byte-format.js";
import {
    emitSuiteResults as emitSuiteResultsJson,
    ensureSuitesAreKnown,
    resolveRequestedSuites
} from "./command-suite-helpers.js";

const AVAILABLE_SUITES = new Map();

function collectSuite(value, previous = []) {
    previous.push(value);
    return previous;
}

function validateFormat(value) {
    const normalized = toNormalizedLowerCaseString(value);
    if (normalized === "json" || normalized === "human") {
        return normalized;
    }
    throw new InvalidArgumentError("Format must be either 'json' or 'human'.");
}

function formatErrorDetails(error) {
    const message =
        typeof error?.message === "string"
            ? error.message
            : String(error ?? "Unknown error");
    const stackLines =
        typeof error?.stack === "string" ? error.stack.split("\n") : undefined;
    const name =
        typeof error?.name === "string"
            ? error.name
            : (error?.constructor?.name ?? "Error");

    return { name, message, stack: stackLines };
}

function formatMetrics(label, metrics) {
    return {
        label,
        totalTimeMs: metrics?.totalTimeMs ?? null,
        counters: metrics?.counters ?? {},
        timings: metrics?.timings ?? {},
        caches: metrics?.caches ?? {},
        metadata: metrics?.metadata ?? {}
    };
}

function createBenchmarkContext(resolvedProjectRoot) {
    return {
        results: {
            projectRoot: resolvedProjectRoot,
            index: []
        }
    };
}

async function executeProjectIndexAttempt({
    resolvedProjectRoot,
    logger,
    verbose,
    attempt
}) {
    const buildProjectIndex = resolveCliProjectIndexBuilder();
    try {
        const index = await buildProjectIndex(resolvedProjectRoot, undefined, {
            logger,
            logMetrics: verbose
        });

        return {
            index,
            runRecord: formatMetrics(
                `project-index-run-${attempt}`,
                index.metrics
            )
        };
    } catch (error) {
        const formattedError = formatErrorDetails(error);
        formattedError.hint =
            "Provide --project <path> to a GameMaker project to run this benchmark against real data.";

        return {
            index: null,
            error: formattedError,
            runRecord: {
                label: `project-index-run-${attempt}`,
                error: formattedError
            }
        };
    }
}

async function collectProjectIndexRuns({
    context,
    resolvedProjectRoot,
    logger,
    verbose
}) {
    const { results } = context;
    let latestIndex = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const attemptResult = await executeProjectIndexAttempt({
            resolvedProjectRoot,
            logger,
            verbose,
            attempt
        });
        const { shouldStop, nextLatestIndex } = recordProjectIndexAttempt(
            results,
            attemptResult
        );

        if (shouldStop) {
            return { latestIndex: null };
        }

        latestIndex = nextLatestIndex;
    }

    return { latestIndex };
}

/**
 * Store the outcome of a project index attempt in the aggregated results.
 *
 * @param {{ index: Array<object>, error?: object }} results
 * @param {{ runRecord: object, error?: object, index?: object }} attemptResult
 * @returns {{ shouldStop: boolean, nextLatestIndex: object | null }}
 */
function recordProjectIndexAttempt(results, attemptResult) {
    results.index.push(attemptResult.runRecord);

    if (attemptResult.error) {
        results.error = attemptResult.error;
        return { shouldStop: true, nextLatestIndex: null };
    }

    return {
        shouldStop: false,
        nextLatestIndex: attemptResult.index ?? null
    };
}

function createRenameOptions({ file, latestIndex, logger, verbose }) {
    return {
        filepath: path.resolve(file),
        __identifierCaseProjectIndex: latestIndex,
        gmlIdentifierCase: "camel",
        gmlIdentifierCaseLocals: "camel",
        gmlIdentifierCaseAssets: "pascal",
        gmlIdentifierCaseAcknowledgeAssetRenames: true,
        logIdentifierCaseMetrics: verbose,
        logger
    };
}

function createRenamePlanResult(renameOptions) {
    const renamePlan = formatMetrics(
        "identifier-case-plan",
        renameOptions.__identifierCaseMetricsReport
    );
    renamePlan.operations =
        renameOptions.__identifierCaseRenamePlan?.operations?.length ?? 0;
    renamePlan.conflicts = renameOptions.__identifierCaseConflicts?.length ?? 0;
    return renamePlan;
}

async function attachRenamePlanIfRequested({
    context,
    file,
    latestIndex,
    logger,
    verbose
}) {
    if (!file) {
        return;
    }

    if (!latestIndex) {
        context.results.renamePlan = {
            skipped: true,
            reason: "Project index could not be built; rename plan skipped."
        };
        return;
    }

    const renameOptions = createRenameOptions({
        file,
        latestIndex,
        logger,
        verbose
    });

    try {
        const prepareIdentifierCasePlan =
            resolveCliIdentifierCasePlanPreparer();
        await prepareIdentifierCasePlan(renameOptions);
        context.results.renamePlan = createRenamePlanResult(renameOptions);
    } catch (error) {
        context.results.renamePlan = { error: formatErrorDetails(error) };
    }
}

async function runIdentifierPipelineBenchmark({ projectRoot, file, verbose }) {
    const resolvedProjectRoot = path.resolve(projectRoot ?? process.cwd());
    const logger = verbose
        ? { debug: (...args) => console.debug(...args) }
        : null;

    const context = createBenchmarkContext(resolvedProjectRoot);
    const { latestIndex } = await collectProjectIndexRuns({
        context,
        resolvedProjectRoot,
        logger,
        verbose
    });

    await attachRenamePlanIfRequested({
        context,
        file,
        latestIndex,
        logger,
        verbose
    });

    return context.results;
}

function runIdentifierTextBenchmark() {
    const dataset = [
        "simple",
        { name: "identifier" },
        { type: "Identifier", name: "player" },
        {
            type: "MemberDotExpression",
            object: { type: "Identifier", name: "player" },
            property: { type: "Identifier", name: "x" }
        },
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "inventory" },
            property: [
                {
                    type: "Literal",
                    value: "potion"
                }
            ]
        },
        {
            type: "MemberIndexExpression",
            object: { type: "Identifier", name: "grid" },
            property: [
                {
                    type: "MemberDotExpression",
                    object: { type: "Identifier", name: "position" },
                    property: { type: "Identifier", name: "x" }
                }
            ]
        }
    ];

    const iterations = 5_000_000;
    let checksum = 0;

    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) {
        const node = dataset[index % dataset.length];
        const result = getIdentifierText(node);
        if (typeof result === "string") {
            checksum += result.length;
        }
    }
    const duration = performance.now() - start;

    return { iterations, checksum, duration };
}

async function runProjectIndexMemoryMeasurement({ projectRoot }) {
    if (typeof globalThis.gc !== "function") {
        return {
            skipped: true,
            reason: "Garbage collection is not exposed. Run with 'node --expose-gc' to enable the memory benchmark."
        };
    }

    const { readFile } = await import("node:fs/promises");

    const buildProjectIndex = resolveCliProjectIndexBuilder();

    const fsFacade = {
        async readDir() {
            return [];
        },
        async stat() {
            return { mtimeMs: 0 };
        },
        async readFile(targetPath, encoding) {
            if (targetPath.endsWith("gml-identifiers.json")) {
                return readFile(targetPath, encoding);
            }

            const error = new Error("ENOENT");
            error.code = "ENOENT";
            throw error;
        }
    };

    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = process.memoryUsage().heapUsed;

    await buildProjectIndex(
        path.resolve(projectRoot ?? "/tmp/prettier-plugin-gml"),
        fsFacade
    );

    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const after = process.memoryUsage().heapUsed;

    return {
        before,
        after,
        delta: after - before,
        formatted: {
            before: formatByteSize(before, {
                decimals: 2,
                decimalsForBytes: 2,
                separator: " "
            }),
            after: formatByteSize(after, {
                decimals: 2,
                decimalsForBytes: 2,
                separator: " "
            }),
            delta: formatByteSize(Math.abs(after - before), {
                decimals: 2,
                decimalsForBytes: 2,
                separator: " "
            })
        }
    };
}

AVAILABLE_SUITES.set("identifier-pipeline", runIdentifierPipelineBenchmark);
AVAILABLE_SUITES.set("identifier-text", () => runIdentifierTextBenchmark());
AVAILABLE_SUITES.set("project-index-memory", runProjectIndexMemoryMeasurement);

export function createPerformanceCommand() {
    return applyStandardCommandOptions(
        new Command()
            .name("performance")
            .usage("[options]")
            .description("Run performance and benchmarking suites for the CLI.")
    )
        .option(
            "-p, --project <path>",
            "Project root to index during benchmarks.",
            (value) => path.resolve(value),
            process.cwd()
        )
        .option(
            "-f, --file <path>",
            "Optional file path used by the identifier pipeline benchmark.",
            (value) => path.resolve(value)
        )
        .option(
            "-s, --suite <name>",
            "Benchmark suite to run (can be provided multiple times).",
            collectSuite,
            []
        )
        .option(
            "--format <format>",
            "Output format: json (default) or human.",
            validateFormat,
            "json"
        )
        .option("--pretty", "Pretty-print JSON output.")
        .option(
            "--verbose",
            "Enable verbose logging for suites that support it."
        );
}

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
            results[suiteName] = { error: formatErrorDetails(error) };
        }
    }
    return results;
}

function printHumanReadable(results) {
    const lines = ["Performance benchmark results:"];
    for (const [suite, payload] of Object.entries(results)) {
        lines.push(`\n• ${suite}`);
        if (payload?.skipped) {
            lines.push(
                `  - skipped: ${payload.reason ?? "No reason provided"}`
            );
            continue;
        }
        lines.push(`  - result: ${JSON.stringify(payload)}`);
    }
    console.log(lines.join("\n"));
}

/**
 * Determine whether the current invocation only requested CLI help output.
 *
 * @param {import("commander").Command} command
 * @param {Array<string>} argv
 * @returns {boolean}
 */
/**
 * Normalize the requested benchmark suite names.
 *
 * @param {{ suite: Array<string> }} options
 * @returns {Array<string>}
 */
function createSuiteExecutionOptions(options) {
    return {
        projectRoot: options.project,
        file: options.file,
        verbose: Boolean(options.verbose)
    };
}

export async function runPerformanceCommand({ command } = {}) {
    const options = command?.opts?.() ?? {};

    const requestedSuites = resolveRequestedSuites(options, AVAILABLE_SUITES);
    ensureSuitesAreKnown(requestedSuites, AVAILABLE_SUITES, command);

    const suiteResults = await executeSuites(
        requestedSuites,
        createSuiteExecutionOptions(options)
    );

    const emittedJson = emitSuiteResultsJson(suiteResults, options);
    if (!emittedJson) {
        printHumanReadable(suiteResults);
    }

    return 0;
}
