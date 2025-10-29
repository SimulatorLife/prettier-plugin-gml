import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import {
    SuiteOutputFormat,
    applyStandardCommandOptions,
    collectSuiteResults,
    Command,
    Option,
    createCliErrorDetails,
    emitSuiteResults,
    ensureSuitesAreKnown,
    formatByteSize,
    resolveRequestedSuites,
    resolveSuiteOutputFormatOrThrow,
    wrapInvalidArgumentResolver,
    InvalidArgumentError
} from "../dependencies.js";
import { resolvePluginEntryPoint as resolveCliPluginEntryPoint } from "../plugin-runtime-dependencies.js";
import {
    appendToCollection,
    assertArray,
    coercePositiveInteger,
    ensureDir,
    isFiniteNumber,
    getErrorMessageOrFallback,
    getIdentifierText,
    resolveIntegerOption,
    toNormalizedInteger,
    stringifyJsonForFile,
    resolveModuleDefaultExport,
    createCliRunSkippedError,
    isCliRunSkipped
} from "../dependencies.js";
import {
    PerformanceSuiteName,
    formatPerformanceSuiteList,
    isPerformanceThroughputSuite,
    normalizePerformanceSuiteName
} from "./suite-options.js";
import { formatMetricValue } from "./metric-formatters.js";
import {
    REPO_ROOT,
    createPathFilter,
    normalizeFixtureRoots
} from "./fixture-roots.js";

export { normalizeFixtureRoots } from "./fixture-roots.js";

const shouldSkipPerformanceDependencies = isCliRunSkipped();

const AVAILABLE_SUITES = new Map();

const TEST_RESULTS_DIRECTORY = path.resolve(REPO_ROOT, "reports");
const DEFAULT_REPORT_FILE = path.join(
    TEST_RESULTS_DIRECTORY,
    "performance-report.json"
);
const DATASET_CACHE_KEY = "gml-fixtures";
const SUPPORTS_WEAK_REF = typeof WeakRef === "function";
const SKIP_PERFORMANCE_RESOLUTION_MESSAGE =
    "Clear the environment variable to enable CLI performance suites.";

function resolveCachedDataset(cache) {
    if (!cache || typeof cache.get !== "function") {
        return null;
    }

    const entry = cache.get(DATASET_CACHE_KEY);
    if (!entry) {
        return null;
    }

    const deref = typeof entry?.deref === "function" ? entry.deref : null;
    if (!deref) {
        return entry;
    }

    const dataset = deref.call(entry);
    if (dataset) {
        return dataset;
    }

    cache.delete(DATASET_CACHE_KEY);
    return null;
}

function storeDatasetInCache(cache, dataset) {
    if (!cache || typeof cache.set !== "function") {
        return;
    }

    if (SUPPORTS_WEAK_REF) {
        cache.set(DATASET_CACHE_KEY, new WeakRef(dataset));
        return;
    }

    cache.set(DATASET_CACHE_KEY, dataset);
}

function createDatasetSummary({ fileCount, totalBytes }) {
    const normalizedFileCount = Math.max(
        0,
        toNormalizedInteger(fileCount) ?? 0
    );

    const normalizedTotalBytes =
        isFiniteNumber(totalBytes) && totalBytes >= 0 ? totalBytes : 0;

    return {
        files: normalizedFileCount,
        totalBytes: normalizedTotalBytes
    };
}

function collectValue(value, previous) {
    return appendToCollection(value, previous);
}

function collectPerformanceSuite(value, previous) {
    const normalized = normalizePerformanceSuiteName(value, {
        errorConstructor: InvalidArgumentError
    });

    return appendToCollection(normalized, previous);
}

function formatErrorDetails(error, { fallbackMessage } = {}) {
    return createCliErrorDetails(error, {
        fallbackMessage: fallbackMessage ?? "Unknown error"
    });
}

async function traverseForFixtures(directory, visitor, pathFilter) {
    if (pathFilter && !pathFilter.allowsDirectory(directory)) {
        return;
    }

    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return;
        }
        throw error;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const resolvedPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await traverseForFixtures(resolvedPath, visitor, pathFilter);
        } else if (
            entry.isFile() &&
            entry.name.toLowerCase().endsWith(".gml") &&
            (!pathFilter || pathFilter.allowsPath(resolvedPath))
        ) {
            visitor(resolvedPath);
        }
    }
}

async function collectFixtureFilePaths(directories, pathFilterOptions) {
    const pathFilter = createPathFilter(pathFilterOptions);
    const fileMap = new Map();

    for (const directory of directories) {
        await traverseForFixtures(
            directory,
            (filePath) => {
                const relative = path.relative(REPO_ROOT, filePath);
                if (!fileMap.has(relative)) {
                    fileMap.set(relative, filePath);
                }
            },
            pathFilter
        );
    }

    return [...fileMap.values()].sort((a, b) => a.localeCompare(b));
}

async function loadFixtureDataset({ directories, pathFilter } = {}) {
    const fixtureDirectories = normalizeFixtureRoots(
        directories ?? [],
        pathFilter
    );
    const fixturePaths = await collectFixtureFilePaths(
        fixtureDirectories,
        pathFilter
    );
    const files = await loadFixtureFiles(fixturePaths);

    return createDatasetFromFiles(files);
}

function normalizeCustomDataset(dataset) {
    const entries = assertArray(dataset, {
        name: "dataset",
        errorMessage: "Custom datasets must be provided as an array."
    });

    const files = entries.map((entry, index) =>
        normalizeCustomDatasetEntry(entry, index)
    );

    return createDatasetFromFiles(files);
}

/**
 * Combine normalized fixture records into the dataset payload expected by
 * benchmark runners.
 *
 * @param {Array<{ path: string, relativePath: string, source: string, size: number }>} files
 */
function createDatasetFromFiles(files) {
    let totalBytes = 0;
    for (const file of files) {
        totalBytes += file.size;
    }

    return {
        files,
        summary: createDatasetSummary({
            fileCount: files.length,
            totalBytes
        })
    };
}

/**
 * Read the benchmark fixture files in a stable order so dataset consumers see
 * deterministic output regardless of the underlying filesystem.
 *
 * @param {Array<string>} fixturePaths
 */
async function loadFixtureFiles(fixturePaths) {
    const records = [];
    for (const absolutePath of fixturePaths) {
        records.push(await readFixtureFileRecord(absolutePath));
    }
    return records;
}

/**
 * Resolve a single fixture file into the canonical dataset record structure.
 */
async function readFixtureFileRecord(absolutePath) {
    const source = await fs.readFile(absolutePath, "utf8");
    return createFixtureRecord({ absolutePath, source });
}

/**
 * Normalize fixture metadata while enforcing consistent size and relative path
 * semantics regardless of where the record originated.
 */
function createFixtureRecord({ absolutePath, source, size, relativePath }) {
    const resolvedSize = isFiniteNumber(size)
        ? size
        : Buffer.byteLength(source);
    const resolvedRelativePath =
        typeof relativePath === "string"
            ? relativePath
            : path.relative(REPO_ROOT, absolutePath);

    return {
        path: absolutePath,
        relativePath: resolvedRelativePath,
        source,
        size: resolvedSize
    };
}

function normalizeCustomDatasetEntry(entry, index) {
    if (!entry || typeof entry !== "object") {
        throw new TypeError(
            "Each dataset entry must be an object with a source string."
        );
    }

    const source = entry.source;
    if (typeof source !== "string") {
        throw new TypeError(
            "Dataset entries must include a string `source` property."
        );
    }

    const providedPath =
        typeof entry.path === "string" ? entry.path : `<fixture-${index}>`;
    const resolvedRelativePath =
        typeof entry.relativePath === "string"
            ? entry.relativePath
            : providedPath.startsWith("<")
              ? providedPath
              : path.relative(REPO_ROOT, providedPath);

    return createFixtureRecord({
        absolutePath: providedPath,
        source,
        size: entry.size,
        relativePath: resolvedRelativePath
    });
}

async function resolveDatasetFromOptions(options = {}) {
    if (options.dataset) {
        return normalizeCustomDataset(options.dataset);
    }

    const cachedDataset = resolveCachedDataset(options.datasetCache);
    if (cachedDataset) {
        return cachedDataset;
    }

    const dataset = await loadFixtureDataset({
        directories: options.fixtureRoots,
        pathFilter: options.pathFilter
    });

    storeDatasetInCache(options.datasetCache, dataset);

    return dataset;
}

const formatIterationErrorMessage = (received) =>
    `Iterations must be a positive integer (received ${received}).`;

function resolveIterationCount(value) {
    const normalized = resolveIntegerOption(value, {
        defaultValue: 1,
        blankStringReturnsDefault: false,
        coerce: (numericValue, context) =>
            coercePositiveInteger(numericValue, {
                ...context,
                createErrorMessage: formatIterationErrorMessage
            })
    });

    return normalized ?? 1;
}

function createSkipResult(reason) {
    return {
        skipped: true,
        reason
    };
}

function createSkippedPerformanceDependencyError(actionDescription) {
    return createCliRunSkippedError(actionDescription, {
        resolution: SKIP_PERFORMANCE_RESOLUTION_MESSAGE
    });
}

let gmlParserPromise = null;

function resolveGmlParser() {
    if (shouldSkipPerformanceDependencies) {
        return Promise.reject(
            createSkippedPerformanceDependencyError("load the GML parser")
        );
    }

    if (!gmlParserPromise) {
        gmlParserPromise = import("gamemaker-language-parser").then(
            resolveModuleDefaultExport
        );
    }

    return gmlParserPromise;
}

function createDefaultParser() {
    if (shouldSkipPerformanceDependencies) {
        return async () => {
            throw createSkippedPerformanceDependencyError(
                "run parser benchmarks"
            );
        };
    }

    return async (file) => {
        const gmlParser = await resolveGmlParser();
        gmlParser.parse(file.source, {
            getComments: false,
            getLocations: false,
            simplifyLocations: true,
            getIdentifierMetadata: false
        });
    };
}

let prettierModulePromise = null;

async function resolvePrettier() {
    if (!prettierModulePromise) {
        prettierModulePromise = import("prettier").then(
            resolveModuleDefaultExport
        );
    }

    return prettierModulePromise;
}

function createDefaultFormatter({ prettier, pluginPath }) {
    return async (file) => {
        await prettier.format(file.source, {
            plugins: [pluginPath],
            parser: "gml-parse",
            filepath: file.path
        });
    };
}

function resolveNow(now) {
    if (typeof now === "function") {
        return now;
    }

    return () => performance.now();
}

function createBenchmarkResult({ dataset, durations, iterations }) {
    const totalDuration = durations.reduce(
        (sum, duration) => sum + duration,
        0
    );
    const datasetSummary = createDatasetSummary({
        fileCount: dataset.summary.files,
        totalBytes: dataset.summary.totalBytes
    });
    const totalFilesProcessed = datasetSummary.files * iterations;
    const totalBytesProcessed = datasetSummary.totalBytes * iterations;

    return {
        iterations,
        durations,
        totalDurationMs: totalDuration,
        averageDurationMs: iterations > 0 ? totalDuration / iterations : 0,
        dataset: datasetSummary,
        throughput: {
            filesPerMs:
                totalDuration > 0 ? totalFilesProcessed / totalDuration : null,
            bytesPerMs:
                totalDuration > 0 ? totalBytesProcessed / totalDuration : null
        }
    };
}

/**
 * Execute a single dataset iteration and measure its duration. Centralizing the
 * bookkeeping keeps the high-level benchmark runner focused on orchestration.
 */
async function measureSingleIterationDuration({ files, worker, now }) {
    const start = now();

    for (const file of files) {
        // Await in case callers provide asynchronous worker implementations.
        await worker(file);
    }

    return now() - start;
}

/**
 * Collect durations for each benchmark iteration so the orchestrator can simply
 * request a duration list without managing array mutation directly.
 */
async function measureBenchmarkDurations({ dataset, iterations, worker, now }) {
    const durations = [];

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const duration = await measureSingleIterationDuration({
            files: dataset.files,
            worker,
            now
        });
        durations.push(duration);
    }

    return durations;
}

async function runFixtureDatasetBenchmark(
    options,
    { skipReason, resolveWorker }
) {
    const dataset = await resolveDatasetFromOptions(options);

    if (!dataset || dataset.summary.files === 0) {
        return createSkipResult(skipReason);
    }

    const iterations = resolveIterationCount(options.iterations);
    const worker = await resolveWorker(options);
    const now = resolveNow(options.now);
    const durations = await measureBenchmarkDurations({
        dataset,
        iterations,
        worker,
        now
    });

    return createBenchmarkResult({ dataset, durations, iterations });
}

export async function runParserBenchmark(options = {}) {
    return runFixtureDatasetBenchmark(options, {
        skipReason: "No GameMaker fixtures were available to parse.",
        resolveWorker: async (benchmarkOptions) =>
            typeof benchmarkOptions.parser === "function"
                ? benchmarkOptions.parser
                : createDefaultParser()
    });
}

export async function runFormatterBenchmark(options = {}) {
    return runFixtureDatasetBenchmark(options, {
        skipReason: "No GameMaker fixtures were available to format.",
        resolveWorker: async (benchmarkOptions) => {
            if (typeof benchmarkOptions.formatter === "function") {
                return benchmarkOptions.formatter;
            }

            const prettierInstance =
                benchmarkOptions.prettier ?? (await resolvePrettier());
            const pluginPath =
                benchmarkOptions.pluginPath ?? resolveCliPluginEntryPoint();

            return createDefaultFormatter({
                prettier: prettierInstance,
                pluginPath
            });
        }
    });
}

function createIdentifierTextDataset() {
    return [
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
}

function resolveIdentifierTextIterations() {
    return 5_000_000;
}

function benchmarkIdentifierTextDataset(dataset, iterations) {
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

function runIdentifierTextBenchmark() {
    const dataset = createIdentifierTextDataset();
    const iterations = resolveIdentifierTextIterations();
    return benchmarkIdentifierTextDataset(dataset, iterations);
}

AVAILABLE_SUITES.set(PerformanceSuiteName.PARSER, runParserBenchmark);
AVAILABLE_SUITES.set(PerformanceSuiteName.FORMATTER, runFormatterBenchmark);
AVAILABLE_SUITES.set(PerformanceSuiteName.IDENTIFIER_TEXT, () =>
    runIdentifierTextBenchmark()
);

export function createPerformanceCommand() {
    const defaultReportFileDescription =
        formatReportFilePath(DEFAULT_REPORT_FILE);
    const reportFileOption = new Option(
        "--report-file <path>",
        "File path for the JSON performance report."
    )
        .argParser((value) => path.resolve(value))
        .default(DEFAULT_REPORT_FILE, defaultReportFileDescription);

    const suiteListDescription = formatPerformanceSuiteList();
    const suiteOptionDescription = [
        "Benchmark suite to run (can be provided multiple times).",
        `Available suites: ${suiteListDescription}.`,
        "Defaults to all suites when omitted."
    ].join(" ");
    const suiteOption = new Option("-s, --suite <name>", suiteOptionDescription)
        .argParser(collectPerformanceSuite)
        .default([], "all available suites");

    return applyStandardCommandOptions(
        new Command()
            .name("performance")
            .usage("[options]")
            .description(
                "Run parser and formatter performance benchmarks for the CLI."
            )
    )
        .addOption(suiteOption)
        .option(
            "-i, --iterations <count>",
            "Repeat each suite this many times.",
            wrapInvalidArgumentResolver((value) =>
                resolveIterationCount(value)
            ),
            1
        )
        .option(
            "--fixture-root <path>",
            "Include an additional directory of .gml fixtures (may be provided multiple times).",
            collectValue,
            []
        )
        .addOption(reportFileOption)
        .option(
            "--skip-report",
            "Disable writing the JSON performance report to disk."
        )
        .option("--stdout", "Emit the performance report to stdout.")
        .option(
            "--format <format>",
            "Console output format when --stdout is used: json or human.",
            (value) =>
                resolveSuiteOutputFormatOrThrow(value, {
                    errorConstructor: InvalidArgumentError
                }),
            SuiteOutputFormat.JSON
        )
        .option("--pretty", "Pretty-print JSON output.");
}

function createSuiteExecutionOptions(options, { workflow } = {}) {
    const pathFilter = createPathFilter(workflow);

    return {
        iterations: resolveIterationCount(options.iterations),
        fixtureRoots: normalizeFixtureRoots(
            options.fixtureRoot ?? [],
            pathFilter
        ),
        datasetCache: new Map(),
        pathFilter
    };
}

async function writeReport(report, options) {
    if (options.skipReport) {
        return { skipped: true };
    }

    const targetFile = options.reportFile ?? DEFAULT_REPORT_FILE;
    if (!targetFile) {
        return { skipped: true };
    }

    const directory = path.dirname(targetFile);
    await ensureDir(directory);

    const spacing = options.pretty ? 2 : 0;
    const payload = stringifyJsonForFile(report, { space: spacing });
    await fs.writeFile(targetFile, payload, "utf8");

    return { skipped: false, path: targetFile };
}

function formatReportFilePath(targetFile) {
    if (!targetFile) {
        return "";
    }

    const absolutePath = path.resolve(targetFile);
    const relativeToCwd = path.relative(process.cwd(), absolutePath);

    if (!relativeToCwd) {
        return ".";
    }

    if (!relativeToCwd.startsWith("..") && !path.isAbsolute(relativeToCwd)) {
        return relativeToCwd;
    }

    return absolutePath;
}

function createHumanReadableReportHeader(report) {
    return [
        "Performance benchmark results:",
        `Generated at: ${report.generatedAt}`
    ];
}

function createHumanReadableSuiteLines({ suite, payload }) {
    const lines = [`\n• ${suite}`];

    if (payload?.skipped) {
        lines.push(`  - skipped: ${payload.reason ?? "No reason provided"}`);
        return lines;
    }

    if (payload?.error) {
        const errorMessage = getErrorMessageOrFallback(payload.error);
        lines.push(`  - error: ${errorMessage}`);
        return lines;
    }

    if (isPerformanceThroughputSuite(suite)) {
        const datasetBytes = payload?.dataset?.totalBytes ?? 0;
        lines.push(
            `  - iterations: ${payload?.iterations}`,
            `  - files: ${payload?.dataset?.files ?? 0}`
        );
        lines.push(
            `  - total duration: ${formatMetricValue(payload?.totalDurationMs, {
                unit: "ms"
            })}`
        );
        lines.push(
            `  - average duration: ${formatMetricValue(
                payload?.averageDurationMs,
                {
                    unit: "ms"
                }
            )}`
        );
        lines.push(
            `  - dataset size: ${formatByteSize(datasetBytes, {
                decimals: 2,
                decimalsForBytes: 2,
                separator: " "
            })}`
        );
        lines.push(
            `  - throughput (files/ms): ${formatMetricValue(
                payload?.throughput?.filesPerMs,
                { unit: "files/ms" }
            )}`
        );
        lines.push(
            `  - throughput (bytes/ms): ${formatMetricValue(
                payload?.throughput?.bytesPerMs,
                { unit: "bytes/ms" }
            )}`
        );
        return lines;
    }

    lines.push(`  - result: ${JSON.stringify(payload)}`);
    return lines;
}

function createHumanReadableSuiteSections(suites) {
    const entries = Object.entries(suites ?? {});

    if (entries.length === 0) {
        return ["No suites were executed."];
    }

    const sections = [];
    for (const [suite, payload] of entries) {
        sections.push(...createHumanReadableSuiteLines({ suite, payload }));
    }

    return sections;
}

function createHumanReadableReportLines(report) {
    return [
        ...createHumanReadableReportHeader(report),
        ...createHumanReadableSuiteSections(report.suites)
    ];
}

function printHumanReadable(report) {
    const lines = createHumanReadableReportLines(report);
    console.log(lines.join("\n"));
}

function emitReport(report, options) {
    const emittedJson = emitSuiteResults(report.suites, options, {
        payload: report
    });

    if (!emittedJson) {
        printHumanReadable(report);
    }
}

function clearDatasetCache(cache) {
    if (cache && typeof cache.clear === "function") {
        cache.clear();
    }
}

async function executeWithDatasetCleanup(runnerOptions, task) {
    try {
        return await task();
    } finally {
        clearDatasetCache(runnerOptions?.datasetCache);
    }
}

async function collectPerformanceSuiteResults({
    requestedSuites,
    runnerOptions
}) {
    return executeWithDatasetCleanup(runnerOptions, () =>
        collectSuiteResults({
            suiteNames: requestedSuites,
            availableSuites: AVAILABLE_SUITES,
            runnerOptions,
            onError: (error) => ({ error: formatErrorDetails(error) })
        })
    );
}

function createPerformanceReportPayload(suiteResults) {
    return {
        generatedAt: new Date().toISOString(),
        suites: suiteResults
    };
}

function logReportDestination(reportResult, { stdout }) {
    if (!reportResult?.path) {
        return;
    }

    const displayPath = formatReportFilePath(reportResult.path);
    const log = stdout ? console.error : console.log;
    log(`Performance report written to ${displayPath}.`);
}

function collectSuiteFailureSummaries(results) {
    if (!results || typeof results !== "object") {
        return [];
    }

    const failures = [];

    for (const [suite, payload] of Object.entries(results)) {
        if (!payload || typeof payload !== "object" || !payload.error) {
            continue;
        }

        failures.push({
            suite,
            message: getErrorMessageOrFallback(payload.error, "Unknown error")
        });
    }

    return failures;
}

function formatFailureFollowUp({ stdout, format, displayPath }) {
    if (stdout) {
        if (format === SuiteOutputFormat.HUMAN) {
            const base = "Review the human-readable report above for details.";
            return displayPath
                ? `${base} The JSON report was also written to ${displayPath}.`
                : base;
        }

        if (displayPath) {
            return `Review the streamed report above or inspect ${displayPath} for full details. Re-run with --format human to print a readable summary.`;
        }

        return "Review the streamed report above or re-run with --format human to print a readable summary.";
    }

    if (displayPath) {
        return `Inspect ${displayPath} for full details or re-run with --stdout human to print a readable summary.`;
    }

    return "Re-run with --stdout human to print a readable summary.";
}

function logSuiteFailureSummary(suiteResults, options, reportResult) {
    const failures = collectSuiteFailureSummaries(suiteResults);
    if (failures.length === 0) {
        return;
    }

    const heading =
        failures.length === 1
            ? "Performance suite failure detected:"
            : "Performance suite failures detected:";
    const failureLines = failures.map(
        ({ suite, message }) => `- ${suite}: ${message}`
    );

    const displayPath = reportResult?.path
        ? formatReportFilePath(reportResult.path)
        : "";
    const followUp = formatFailureFollowUp({
        stdout: Boolean(options.stdout),
        format: options.format,
        displayPath
    });

    const message = [heading, ...failureLines, followUp].join("\n");
    console.error(message);
}

function emitReportIfRequested(report, options) {
    if (!options.stdout) {
        return;
    }

    emitReport(report, options);
}

export async function runPerformanceCommand({ command, workflow } = {}) {
    const options = command?.opts?.() ?? {};

    const requestedSuites = resolveRequestedSuites(options, AVAILABLE_SUITES);
    ensureSuitesAreKnown(requestedSuites, AVAILABLE_SUITES, command);

    const runnerOptions = createSuiteExecutionOptions(options, { workflow });
    const suiteResults = await collectPerformanceSuiteResults({
        requestedSuites,
        runnerOptions
    });

    const report = createPerformanceReportPayload(suiteResults);
    const reportResult = await writeReport(report, options);

    logReportDestination(reportResult, options);
    emitReportIfRequested(report, options);
    logSuiteFailureSummary(suiteResults, options, reportResult);

    return 0;
}
