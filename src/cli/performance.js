import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { Command, InvalidArgumentError } from "commander";

import { CliUsageError, handleCliError } from "./cli-errors.js";
import { parseCommandLine } from "./command-parsing.js";
import { buildProjectIndex } from "../plugin/src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../plugin/src/identifier-case/local-plan.js";
import { getIdentifierText } from "../shared/ast-node-helpers.js";
import { formatByteSize } from "../shared/number-utils.js";
import { toNormalizedLowerCaseString } from "../shared/string-utils.js";

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

async function runIdentifierPipelineBenchmark({ projectRoot, file, verbose }) {
    const resolvedProjectRoot = path.resolve(projectRoot ?? process.cwd());
    const logger = verbose
        ? { debug: (...args) => console.debug(...args) }
        : null;

    const indexRuns = [];
    const results = {
        projectRoot: resolvedProjectRoot,
        index: indexRuns
    };
    let latestIndex = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            const index = await buildProjectIndex(
                resolvedProjectRoot,
                undefined,
                {
                    logger,
                    logMetrics: verbose
                }
            );
            indexRuns.push(
                formatMetrics(`project-index-run-${attempt}`, index.metrics)
            );
            latestIndex = index;
        } catch (error) {
            const formattedError = formatErrorDetails(error);
            formattedError.hint =
                "Provide --project <path> to a GameMaker project to run this benchmark against real data.";
            indexRuns.push({
                label: `project-index-run-${attempt}`,
                error: formattedError
            });
            results.error = formattedError;
            break;
        }
    }

    if (file && latestIndex) {
        const filepath = path.resolve(file);
        const renameOptions = {
            filepath,
            __identifierCaseProjectIndex: latestIndex,
            gmlIdentifierCase: "camel",
            gmlIdentifierCaseLocals: "camel",
            gmlIdentifierCaseAssets: "pascal",
            gmlIdentifierCaseAcknowledgeAssetRenames: true,
            logIdentifierCaseMetrics: verbose,
            logger
        };

        try {
            await prepareIdentifierCasePlan(renameOptions);

            results.renamePlan = formatMetrics(
                "identifier-case-plan",
                renameOptions.__identifierCaseMetricsReport
            );
            results.renamePlan.operations =
                renameOptions.__identifierCaseRenamePlan?.operations?.length ??
                0;
            results.renamePlan.conflicts =
                renameOptions.__identifierCaseConflicts?.length ?? 0;
        } catch (error) {
            results.renamePlan = { error: formatErrorDetails(error) };
        }
    } else if (file) {
        results.renamePlan = {
            skipped: true,
            reason: "Project index could not be built; rename plan skipped."
        };
    }

    return results;
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

function createPerformanceCommand() {
    return new Command()
        .name("performance")
        .usage("[options]")
        .description("Run performance and benchmarking suites for the CLI.")
        .exitOverride()
        .allowExcessArguments(false)
        .helpOption("-h, --help", "Show this help message.")
        .showHelpAfterError("(add --help for usage information)")
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

async function main(argv = process.argv.slice(2)) {
    const command = createPerformanceCommand();

    const { helpRequested } = parseCommandLine(command, argv);
    if (helpRequested) {
        return 0;
    }

    const options = command.opts();

    const requestedSuites =
        options.suite.length > 0
            ? options.suite.map((name) => name.toLowerCase())
            : [...AVAILABLE_SUITES.keys()];

    const unknownSuites = requestedSuites.filter(
        (suite) => !AVAILABLE_SUITES.has(suite)
    );
    if (unknownSuites.length > 0) {
        throw new CliUsageError(
            `Unknown suite${unknownSuites.length === 1 ? "" : "s"}: ${unknownSuites.join(", ")}.`,
            { usage: command.helpInformation() }
        );
    }

    const suiteResults = await executeSuites(requestedSuites, {
        projectRoot: options.project,
        file: options.file,
        verbose: Boolean(options.verbose)
    });

    if (options.format === "json") {
        const payload = {
            generatedAt: new Date().toISOString(),
            suites: suiteResults
        };
        const spacing = options.pretty ? 2 : 0;
        process.stdout.write(`${JSON.stringify(payload, null, spacing)}\n`);
    } else {
        printHumanReadable(suiteResults);
    }

    return 0;
}

export async function runPerformanceCli({ argv = process.argv.slice(2) } = {}) {
    try {
        return await main(argv);
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to run performance benchmarks."
        });
        return 1;
    }
}
