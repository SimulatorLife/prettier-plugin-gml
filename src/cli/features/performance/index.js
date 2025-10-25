import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Command, InvalidArgumentError, Option } from "commander";
import GMLParser from "gamemaker-language-parser";

import { applyStandardCommandOptions } from "../../core/command-standard-options.js";
import { createCliErrorDetails } from "../../core/errors.js";
import { wrapInvalidArgumentResolver } from "../../core/command-parsing.js";
import { resolvePluginEntryPoint } from "../../plugin/entry-point.js";
import { formatByteSize } from "../../runtime-options/byte-format.js";
import {
    SuiteOutputFormat,
    resolveSuiteOutputFormatOrThrow,
    collectSuiteResults,
    ensureSuitesAreKnown,
    resolveRequestedSuites
} from "../../core/command-suite-helpers.js";
import {
    appendToCollection,
    assertArray,
    coercePositiveInteger,
    isFiniteNumber,
    getIdentifierText,
    resolveIntegerOption,
    toNormalizedInteger,
    stringifyJsonForFile,
    resolveModuleDefaultExport
} from "../shared/dependencies.js";
import {
    PerformanceSuiteName,
    isPerformanceThroughputSuite,
    normalizePerformanceSuiteName
} from "./suite-options.js";

const AVAILABLE_SUITES = new Map();

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(CLI_DIRECTORY, "..");
const TEST_RESULTS_DIRECTORY = path.resolve(REPO_ROOT, "reports");
const DEFAULT_REPORT_FILE = path.join(
    TEST_RESULTS_DIRECTORY,
    "performance-report.json"
);
const DEFAULT_FIXTURE_DIRECTORIES = Object.freeze([
    path.resolve(REPO_ROOT, "src", "parser", "tests", "input"),
    path.resolve(REPO_ROOT, "src", "plugin", "tests")
]);
const DATASET_CACHE_KEY = "gml-fixtures";
const SUPPORTS_WEAK_REF = typeof WeakRef === "function";

function resolveCachedDataset(cache) {
    if (!cache || typeof cache.get !== "function") {
        return null;
    }

    const entry = cache.get(DATASET_CACHE_KEY);
    if (!entry) {
        return null;
    }

    if (typeof entry?.deref === "function") {
        const dataset = entry.deref();
        if (dataset) {
            return dataset;
        }
        cache.delete(DATASET_CACHE_KEY);
        return null;
    }

    return entry;
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

function collectFixtureRootCandidates(additionalRoots = []) {
    const extras = Array.isArray(additionalRoots)
        ? additionalRoots
        : [additionalRoots];
    return [...DEFAULT_FIXTURE_DIRECTORIES, ...extras];
}

function normalizeFixtureRootCandidate(candidate) {
    if (!candidate || typeof candidate !== "string") {
        return null;
    }

    return path.resolve(candidate);
}

function appendFixtureRootCandidate({ candidate, resolved, seen }) {
    const normalized = normalizeFixtureRootCandidate(candidate);

    if (!normalized || seen.has(normalized)) {
        return;
    }

    seen.add(normalized);
    resolved.push(normalized);
}

export function normalizeFixtureRoots(additionalRoots = []) {
    const resolved = [];
    const seen = new Set();

    for (const candidate of collectFixtureRootCandidates(additionalRoots)) {
        appendFixtureRootCandidate({
            candidate,
            resolved,
            seen
        });
    }

    return resolved;
}

async function traverseForFixtures(directory, visitor) {
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
            await traverseForFixtures(resolvedPath, visitor);
        } else if (
            entry.isFile() &&
            entry.name.toLowerCase().endsWith(".gml")
        ) {
            visitor(resolvedPath);
        }
    }
}

async function collectFixtureFilePaths(directories) {
    const fileMap = new Map();

    for (const directory of directories) {
        await traverseForFixtures(directory, (filePath) => {
            const relative = path.relative(REPO_ROOT, filePath);
            if (!fileMap.has(relative)) {
                fileMap.set(relative, filePath);
            }
        });
    }

    return [...fileMap.values()].sort((a, b) => a.localeCompare(b));
}

async function loadFixtureDataset({ directories } = {}) {
    const fixtureDirectories = normalizeFixtureRoots(directories ?? []);
    const fixturePaths = await collectFixtureFilePaths(fixtureDirectories);
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
        directories: options.fixtureRoots
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

function createDefaultParser() {
    return async (file) => {
        GMLParser.parse(file.source, {
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
                benchmarkOptions.pluginPath ?? resolvePluginEntryPoint();

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
        [
            "File path for the JSON performance report.",
            `Defaults to ${defaultReportFileDescription}.`
        ].join(" ")
    )
        .argParser((value) => path.resolve(value))
        .default(DEFAULT_REPORT_FILE, defaultReportFileDescription);

    return applyStandardCommandOptions(
        new Command()
            .name("performance")
            .usage("[options]")
            .description(
                "Run parser and formatter performance benchmarks for the CLI."
            )
    )
        .option(
            "-s, --suite <name>",
            "Benchmark suite to run (can be provided multiple times).",
            collectPerformanceSuite,
            []
        )
        .option(
            "-i, --iterations <count>",
            "Repeat each suite this many times (default: 1).",
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
            "Console output format when --stdout is used: json (default) or human.",
            (value) =>
                resolveSuiteOutputFormatOrThrow(value, {
                    errorConstructor: InvalidArgumentError
                }),
            SuiteOutputFormat.JSON
        )
        .option("--pretty", "Pretty-print JSON output.");
}

function createSuiteExecutionOptions(options) {
    return {
        iterations: resolveIterationCount(options.iterations),
        fixtureRoots: normalizeFixtureRoots(options.fixtureRoot ?? []),
        datasetCache: new Map()
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
    await fs.mkdir(directory, { recursive: true });

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

function formatThroughput(value, unit) {
    if (!isFiniteNumber(value)) {
        return "n/a";
    }

    return `${value.toFixed(3)} ${unit}`;
}

function formatDuration(value) {
    if (!isFiniteNumber(value)) {
        return "n/a";
    }

    return `${value.toFixed(3)} ms`;
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
        const errorMessage = payload.error?.message ?? "Unknown error";
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
            `  - total duration: ${formatDuration(payload?.totalDurationMs)}`
        );
        lines.push(
            `  - average duration: ${formatDuration(payload?.averageDurationMs)}`
        );
        lines.push(
            `  - dataset size: ${formatByteSize(datasetBytes, {
                decimals: 2,
                decimalsForBytes: 2,
                separator: " "
            })}`
        );
        lines.push(
            `  - throughput (files/ms): ${formatThroughput(
                payload?.throughput?.filesPerMs,
                "files/ms"
            )}`
        );
        lines.push(
            `  - throughput (bytes/ms): ${formatThroughput(
                payload?.throughput?.bytesPerMs,
                "bytes/ms"
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
    const format = resolveSuiteOutputFormatOrThrow(options.format, {
        fallback: SuiteOutputFormat.JSON,
        errorConstructor: InvalidArgumentError
    });

    if (format === SuiteOutputFormat.JSON) {
        const spacing = options.pretty ? 2 : 0;
        const serialized = stringifyJsonForFile(report, { space: spacing });
        process.stdout.write(serialized);
        return;
    }

    printHumanReadable(report);
}

export async function runPerformanceCommand({ command } = {}) {
    const options = command?.opts?.() ?? {};

    const requestedSuites = resolveRequestedSuites(options, AVAILABLE_SUITES);
    ensureSuitesAreKnown(requestedSuites, AVAILABLE_SUITES, command);

    const runnerOptions = createSuiteExecutionOptions(options);

    let suiteResults;
    try {
        suiteResults = await collectSuiteResults({
            suiteNames: requestedSuites,
            availableSuites: AVAILABLE_SUITES,
            runnerOptions,
            onError: (error) => ({ error: formatErrorDetails(error) })
        });
    } finally {
        runnerOptions.datasetCache.clear();
    }

    const report = {
        generatedAt: new Date().toISOString(),
        suites: suiteResults
    };

    const reportResult = await writeReport(report, options);

    if (reportResult?.path) {
        const displayPath = formatReportFilePath(reportResult.path);
        console.log(`Performance report written to ${displayPath}.`);
    }

    if (options.stdout) {
        emitReport(report, options);
    }

    return 0;
}
