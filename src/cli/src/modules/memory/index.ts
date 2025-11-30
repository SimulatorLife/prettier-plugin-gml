import path from "node:path";
import process from "node:process";
import { readFile, type FileHandle } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { PathLike, WriteFileOptions } from "node:fs";
import type { Stream } from "node:stream";

import {
    appendToCollection,
    callWithFallback,
    Command,
    createEnvConfiguredValue,
    createStringEnumeratedOptionHelpers,
    describeValueWithArticle,
    getErrorMessageOrFallback,
    getNonEmptyTrimmedString,
    incrementMapValue,
    InvalidArgumentError,
    isFsErrorCode,
    isNonEmptyString,
    normalizeStringList,
    Option,
    resolveModuleDefaultExport,
    parseJsonObjectWithContext,
    splitLines,
    SuiteOutputFormat,
    applyEnvOptionOverrides,
    applyStandardCommandOptions,
    coercePositiveInteger,
    collectSuiteResults,
    createIntegerOptionToolkit,
    createNumericTypeErrorFormatter,
    createSuiteResultsPayload,
    emitSuiteResults as emitSuiteResultsJson,
    ensureSuitesAreKnown,
    resolveRequestedSuites,
    resolveSuiteOutputFormatOrThrow,
    wrapInvalidArgumentResolver,
    REPO_ROOT,
    resolveFromRepoRoot,
    writeJsonArtifact
} from "../dependencies.js";
import { loadGmlParser } from "./gml-parser.js";
import { importPluginModule } from "../plugin-runtime-dependencies.js";
import type { CommanderCommandLike } from "../../cli-core/commander-types.js";

export const DEFAULT_ITERATIONS = 500_000;
export const MEMORY_ITERATIONS_ENV_VAR = "GML_MEMORY_ITERATIONS";

export const DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT = 5;
export const MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR =
    "GML_MEMORY_AST_COMMON_NODE_LIMIT";

export const DEFAULT_MEMORY_REPORT_DIR = "reports";
const DEFAULT_MEMORY_REPORT_FILENAME = "memory.json";
const PROJECT_ROOT = REPO_ROOT;

const PARSER_SAMPLE_RELATIVE_PATH = "src/parser/test/input/SnowState.gml";
const FORMAT_SAMPLE_RELATIVE_PATH = "src/plugin/test/testFormatting.input.gml";
const FORMAT_OPTIONS_RELATIVE_PATH =
    "src/plugin/test/testFormatting.options.json";
export const MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR =
    "GML_MEMORY_PARSER_MAX_ITERATIONS";
export const DEFAULT_MAX_PARSER_ITERATIONS = 25;
export const MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR =
    "GML_MEMORY_FORMAT_MAX_ITERATIONS";
export const DEFAULT_MAX_FORMAT_ITERATIONS = 25;
export const MEMORY_REPORT_DIRECTORY_ENV_VAR = "GML_MEMORY_REPORT_DIR";

export const MemorySuiteName = Object.freeze({
    NORMALIZE_STRING_LIST: "normalize-string-list",
    PARSER_AST: "parser-ast",
    PLUGIN_FORMAT: "plugin-format"
});

const memorySuiteHelpers = createStringEnumeratedOptionHelpers(
    Object.values(MemorySuiteName),
    {
        valueLabel: "Memory suite name",
        formatErrorMessage({ list, received }) {
            return `Memory suite must be one of: ${list}. Received: ${received}.`;
        }
    }
);

/**
 * Format the supported memory suite identifiers into a human-readable list.
 *
 * The CLI surfaces this string in validation errors so operators can quickly
 * scan the accepted values without hunting through source files or docs.
 *
 * @returns {string} Comma-delimited list of valid suite identifiers.
 */
export function formatMemorySuiteNameList() {
    return memorySuiteHelpers.formatList();
}

/**
 * Normalize an arbitrary {@link value} into a known memory suite identifier.
 *
 * Wrapping `memorySuiteHelpers.requireValue` clarifies that the CLI accepts
 * string input (such as `--suite parser-ast`) and throws a targeted error when
 * the name falls outside the curated list. Callers may optionally provide a
 * custom {@link errorConstructor} to shape the thrown error type while reusing
 * the shared message formatting.
 *
 * @param {unknown} value Candidate memory suite name provided by the user.
 * @param {{ errorConstructor?: new (...args: Array<any>) => Error }} [options]
 *        Optional override for the error constructor used on failure.
 * @returns {string} Normalized suite name drawn from {@link MemorySuiteName}.
 * @throws {Error} When {@link value} is not a recognized suite identifier.
 */
interface NormalizeMemorySuiteNameOptions {
    errorConstructor?: new (...args: Array<any>) => Error;
}

export function normalizeMemorySuiteName(
    value: unknown,
    { errorConstructor }: NormalizeMemorySuiteNameOptions = {}
) {
    return memorySuiteHelpers.requireValue(value, { errorConstructor });
}

function normalizeMemoryReportDirectory(value, fallback) {
    return getNonEmptyTrimmedString(value) ?? fallback;
}

const memoryReportDirectoryConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_MEMORY_REPORT_DIR,
    envVar: MEMORY_REPORT_DIRECTORY_ENV_VAR,
    normalize: (value, { defaultValue: baseline, previousValue }) =>
        normalizeMemoryReportDirectory(
            value,
            previousValue ?? baseline ?? DEFAULT_MEMORY_REPORT_DIR
        )
});

function getDefaultMemoryReportDirectory() {
    return memoryReportDirectoryConfig.get();
}

function setDefaultMemoryReportDirectory(value) {
    return memoryReportDirectoryConfig.set(value);
}

interface ResolveMemoryReportDirectoryOptions {
    defaultValue?: string | null | undefined;
}

function resolveMemoryReportDirectory(
    value?: string | null,
    { defaultValue }: ResolveMemoryReportDirectoryOptions = {}
) {
    const fallback = normalizeMemoryReportDirectory(
        defaultValue,
        getDefaultMemoryReportDirectory()
    );

    return normalizeMemoryReportDirectory(value, fallback);
}

interface MemoryReportPathOptions {
    cwd: string;
    reportDir?: string | null;
    reportFileName?: string;
}

interface MemoryReportWriterOptions {
    reportPath: string;
    customWriteFile?: (
        file: PathLike | FileHandle,
        data:
            | string
            | Stream
            | ArrayBufferView<ArrayBufferLike>
            | Iterable<string | ArrayBufferView<ArrayBufferLike>>
            | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>,
        options?: WriteFileOptions
    ) => Promise<void>;
}

function applyMemoryReportDirectoryEnvOverride(env) {
    return memoryReportDirectoryConfig.applyEnvOverride(env);
}

const createIterationErrorMessage = (received) =>
    `Iteration count must be a positive integer (received ${received}).`;

const createIterationTypeErrorMessage =
    createNumericTypeErrorFormatter("Iteration count");

const createAstCommonNodeLimitErrorMessage = (received) =>
    `AST common node type limit must be a positive integer (received ${received}).`;

const createAstCommonNodeLimitTypeErrorMessage =
    createNumericTypeErrorFormatter("AST common node type limit");

interface MemoryIterationToolkitOptions {
    defaultValue?: number;
    envVar?: string;
    optionAlias?: string;
    defaultValueOption?: string;
}

interface MemoryIterationEnvOverrideOptions {
    envVar: string;
    error: unknown;
    fallback: number | undefined;
}

function createMemoryIterationToolkit({
    defaultValue,
    envVar,
    optionAlias
}: MemoryIterationToolkitOptions = {}) {
    return createIntegerOptionToolkit({
        defaultValue,
        envVar,
        baseCoerce: coercePositiveInteger,
        createErrorMessage: createIterationErrorMessage,
        typeErrorMessage: createIterationTypeErrorMessage,
        optionAlias
    });
}

const parserIterationLimitToolkit = createMemoryIterationToolkit({
    defaultValue: DEFAULT_MAX_PARSER_ITERATIONS,
    envVar: MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR
});

const {
    getDefault: getMaxParserIterations,
    setDefault: setMaxParserIterations
} = parserIterationLimitToolkit;

function logInvalidIterationEnvOverride({
    envVar,
    error,
    fallback
}: MemoryIterationEnvOverrideOptions) {
    const reason = getErrorMessageOrFallback(error, {
        fallback: `Invalid value provided for ${envVar}.`
    }).trim();
    const suffix = reason.endsWith(".") ? "" : ".";
    const fallbackDetails =
        fallback === undefined
            ? "Falling back to the previous value."
            : `Falling back to ${fallback}.`;

    console.warn(
        `${envVar} override ignored: ${reason}${suffix} ${fallbackDetails}`
    );
}

/**
 * Apply an environment override for a memory iteration toolkit while logging
 * failures.
 *
 * @param {{
 *   getDefault: () => number | undefined;
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined;
 * }} toolkit Numeric option toolkit being updated.
 * @param {string} envVar Environment variable powering the override.
 * @param {NodeJS.ProcessEnv | null | undefined} env Environment map to read.
 * @returns {number | undefined}
 */
function applyIterationToolkitEnvOverride(toolkit, envVar, env) {
    const fallback = toolkit.getDefault();
    return callWithFallback(() => toolkit.applyEnvOverride(env), {
        fallback,
        onError: (error) =>
            logInvalidIterationEnvOverride({ envVar, error, fallback })
    });
}

function applyParserMaxIterationsEnvOverride(env) {
    return applyIterationToolkitEnvOverride(
        parserIterationLimitToolkit,
        MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
        env
    );
}

const formatIterationLimitToolkit = createMemoryIterationToolkit({
    defaultValue: DEFAULT_MAX_FORMAT_ITERATIONS,
    envVar: MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR
});

const {
    getDefault: getMaxFormatIterations,
    setDefault: setMaxFormatIterations
} = formatIterationLimitToolkit;

function applyFormatMaxIterationsEnvOverride(env) {
    return applyIterationToolkitEnvOverride(
        formatIterationLimitToolkit,
        MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR,
        env
    );
}

const astCommonNodeLimitToolkit = createIntegerOptionToolkit({
    defaultValue: DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
    envVar: MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createAstCommonNodeLimitErrorMessage,
    typeErrorMessage: createAstCommonNodeLimitTypeErrorMessage
});

const {
    getDefault: getAstCommonNodeTypeLimit,
    setDefault: setAstCommonNodeTypeLimit,
    applyEnvOverride: applyAstCommonNodeTypeLimitEnvOverride,
    resolve: resolveAstCommonNodeTypeLimit
} = astCommonNodeLimitToolkit;

const sampleCache = new Map();
const SAMPLE_CACHE_MAX_ENTRIES = 4;

function clearSampleCache() {
    sampleCache.clear();
}

function getSampleCacheRecord(label) {
    const cached = sampleCache.get(label) ?? null;
    if (cached === null) {
        return null;
    }

    // Refresh the insertion order so frequently accessed samples stay warm in
    // the cache even when new fixtures are introduced.
    sampleCache.delete(label);
    sampleCache.set(label, cached);
    return cached;
}

function trimSampleCache(limit = SAMPLE_CACHE_MAX_ENTRIES) {
    if (!Number.isFinite(limit)) {
        return;
    }

    if (limit <= 0) {
        sampleCache.clear();
        return;
    }

    while (sampleCache.size > limit) {
        const { value: oldestLabel, done } = sampleCache.keys().next();
        if (done) {
            break;
        }

        sampleCache.delete(oldestLabel);
    }
}

function rememberSampleRecord(label, record) {
    sampleCache.set(label, record);
    trimSampleCache();
}

function getSampleCacheLabels() {
    return [...sampleCache.keys()];
}

function resolveProjectPath(relativePath) {
    return resolveFromRepoRoot(relativePath);
}
async function loadPrettierStandalone() {
    const module = await import("prettier/standalone.mjs");
    return resolveModuleDefaultExport(module);
}

async function loadSampleText(label, relativePath) {
    const cached = getSampleCacheRecord(label);
    if (cached) {
        return cached;
    }

    const absolutePath = resolveProjectPath(relativePath);
    const contents = await readFile(absolutePath, "utf8");
    const record = { contents, path: absolutePath };
    rememberSampleRecord(label, record);
    return record;
}

function describeFormatterOptionsValue(value) {
    return describeValueWithArticle(value);
}

function buildFormatterOptionsTypeErrorMessage(source, value) {
    const location = source ? ` at ${source}` : "";
    return `Formatter options fixture${location} must be a JSON object. Received ${describeFormatterOptionsValue(value)}.`;
}

/**
 * Parse the formatter options fixture JSON and ensure it yields a plain object.
 *
 * @param {string} optionsRaw Raw JSON contents from the formatter options
 *     fixture.
 * @param {{ source?: string }} [options]
 * @returns {Record<string, unknown>} Normalized option overrides.
 */
interface FormatterOptionsFixtureContext {
    source?: string;
}

export function parseFormatterOptionsFixture(
    optionsRaw: string,
    { source }: FormatterOptionsFixtureContext = {}
) {
    return parseJsonObjectWithContext(optionsRaw, {
        source,
        description: "formatter options fixture",
        createAssertOptions: (payload) => ({
            errorMessage: buildFormatterOptionsTypeErrorMessage(source, payload)
        })
    });
}

function captureProcessMemory() {
    const {
        rss = 0,
        heapTotal = 0,
        heapUsed = 0,
        external = 0,
        arrayBuffers = 0
    } = process.memoryUsage();
    return { rss, heapTotal, heapUsed, external, arrayBuffers };
}

function computeMemoryDelta(current, baseline) {
    if (!current || !baseline) {
        return null;
    }

    const entries = Object.entries(baseline).flatMap(([key, beforeValue]) => {
        if (typeof beforeValue !== "number") {
            return [];
        }

        const afterValue = current[key];
        return typeof afterValue === "number"
            ? [[key, afterValue - beforeValue]]
            : [];
    });

    return Object.fromEntries(entries);
}

function normalizeDelta(delta, iterations) {
    if (!delta || !iterations || iterations <= 0) {
        return null;
    }

    const entries = Object.entries(delta).flatMap(([key, value]) =>
        typeof value === "number" ? [[key, value / iterations]] : []
    );

    return Object.fromEntries(entries);
}

function createMemoryTracker({ requirePreciseGc = false } = {}) {
    const gc = typeof globalThis.gc === "function" ? globalThis.gc : null;
    const warnings = [];

    if (!gc && requirePreciseGc) {
        warnings.push(
            "Precise heap measurements require Node to be launched with --expose-gc."
        );
    }

    const runGc = () => {
        if (gc) {
            gc();
        }
    };

    return {
        async measure(executor) {
            runGc();
            const before = captureProcessMemory();
            const start = performance.now();
            const result = await executor();
            const durationMs = performance.now() - start;
            const after = captureProcessMemory();
            let afterGc = null;
            if (gc) {
                runGc();
                afterGc = captureProcessMemory();
            }

            return {
                before,
                after,
                afterGc,
                delta: computeMemoryDelta(after, before),
                deltaAfterGc:
                    afterGc === null
                        ? null
                        : computeMemoryDelta(afterGc, before),
                durationMs,
                warnings: [...warnings],
                result
            };
        }
    };
}

function buildSuiteResult({ measurement, extraWarnings = [] }) {
    const {
        before,
        after,
        afterGc,
        delta,
        deltaAfterGc,
        durationMs,
        warnings,
        result
    } = measurement;
    const iterations =
        typeof result?.iterations === "number" && result.iterations > 0
            ? result.iterations
            : null;

    const memory = {
        unit: "bytes",
        before,
        after,
        afterGc,
        delta,
        deltaPerIteration: normalizeDelta(delta, iterations),
        deltaAfterGc,
        deltaAfterGcPerIteration: normalizeDelta(deltaAfterGc, iterations)
    };

    const response = {
        ...result,
        durationMs,
        heapUsedBefore: before?.heapUsed ?? null,
        heapUsedAfter: after?.heapUsed ?? null,
        heapDelta: delta?.heapUsed ?? null,
        heapUsedAfterGc: afterGc?.heapUsed ?? null,
        heapDeltaAfterGc: deltaAfterGc?.heapUsed ?? null,
        rssBefore: before?.rss ?? null,
        rssAfter: after?.rss ?? null,
        rssDelta: delta?.rss ?? null,
        rssAfterGc: afterGc?.rss ?? null,
        rssDeltaAfterGc: deltaAfterGc?.rss ?? null,
        memory
    };

    const mergedWarnings = [...(warnings ?? []), ...extraWarnings].filter(
        (warning) => isNonEmptyString(warning)
    );

    if (mergedWarnings.length > 0) {
        response.warnings = [...new Set(mergedWarnings)];
    }

    return response;
}

function countLines(text) {
    if (!isNonEmptyString(text)) {
        return 0;
    }

    return splitLines(text).length;
}

function collectCommonNodeTypes(typeCounts) {
    const configuredLimit = getAstCommonNodeTypeLimit();
    const limit = Number.isFinite(configuredLimit)
        ? configuredLimit
        : DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT;

    if (limit <= 0) {
        return [];
    }

    return [...typeCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([type, count]) => ({ type, count }));
}

function summarizeAst(root) {
    if (!root || typeof root !== "object") {
        return {
            nodeCount: 0,
            arrayCount: 0,
            maxDepth: 0,
            commentCount: 0,
            commonNodeTypes: []
        };
    }

    const visited = new Set();
    const stack = [{ value: root, depth: 0 }];
    let nodeCount = 0;
    let arrayCount = 0;
    let maxDepth = 0;
    const typeCounts = new Map();

    while (stack.length > 0) {
        const { value, depth } = stack.pop();

        if (Array.isArray(value)) {
            arrayCount += 1;
            if (depth > maxDepth) {
                maxDepth = depth;
            }
            for (const item of value) {
                if (item && typeof item === "object") {
                    stack.push({ value: item, depth: depth + 1 });
                }
            }
            continue;
        }

        if (!value || typeof value !== "object") {
            continue;
        }

        if (visited.has(value)) {
            continue;
        }

        visited.add(value);

        nodeCount += 1;
        if (typeof value.type === "string") {
            incrementMapValue(typeCounts, value.type);
        }

        const nextDepth = depth + 1;
        if (nextDepth > maxDepth) {
            maxDepth = nextDepth;
        }

        for (const propertyValue of Object.values(value)) {
            if (propertyValue && typeof propertyValue === "object") {
                stack.push({ value: propertyValue, depth: nextDepth });
            }
        }
    }

    const commentCount = Array.isArray(root.comments)
        ? root.comments.length
        : 0;

    const commonNodeTypes = collectCommonNodeTypes(typeCounts);

    return {
        nodeCount,
        arrayCount,
        maxDepth,
        commentCount,
        commonNodeTypes
    };
}

const memoryIterationsToolkit = createMemoryIterationToolkit({
    defaultValue: DEFAULT_ITERATIONS,
    envVar: MEMORY_ITERATIONS_ENV_VAR,
    defaultValueOption: "defaultIterations"
});

const {
    getDefault: getDefaultMemoryIterations,
    setDefault: setDefaultMemoryIterations,
    resolve: resolveMemoryIterations,
    applyEnvOverride: applyMemoryIterationsEnvOverride
} = memoryIterationsToolkit;

export {
    getDefaultMemoryIterations,
    setDefaultMemoryIterations,
    applyMemoryIterationsEnvOverride,
    getMaxParserIterations,
    setMaxParserIterations,
    applyParserMaxIterationsEnvOverride,
    getMaxFormatIterations,
    setMaxFormatIterations,
    applyFormatMaxIterationsEnvOverride,
    getAstCommonNodeTypeLimit,
    setAstCommonNodeTypeLimit,
    applyAstCommonNodeTypeLimitEnvOverride,
    resolveAstCommonNodeTypeLimit,
    getDefaultMemoryReportDirectory,
    setDefaultMemoryReportDirectory,
    applyMemoryReportDirectoryEnvOverride
};

export { resolveMemoryIterations, resolveMemoryReportDirectory };

interface MemoryEnvOptionOverridesContext {
    command?: CommanderCommandLike;
    env?: NodeJS.ProcessEnv;
}

export function applyMemoryEnvOptionOverrides({
    command,
    env
}: MemoryEnvOptionOverridesContext = {}) {
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
            },
            {
                envVar: MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
                optionName: "commonNodeLimit",
                resolveValue: resolveAstCommonNodeTypeLimit
            }
        ]
    });
}

applyMemoryIterationsEnvOverride(process.env);
applyParserMaxIterationsEnvOverride(process.env);
applyFormatMaxIterationsEnvOverride(process.env);
applyMemoryReportDirectoryEnvOverride(process.env);
applyAstCommonNodeTypeLimitEnvOverride(process.env);

const AVAILABLE_SUITES = new Map();

function collectSuite(value, previous) {
    const normalized = normalizeMemorySuiteName(value, {
        errorConstructor: InvalidArgumentError
    });

    return appendToCollection(normalized, previous);
}

export function createMemoryCommand({ env = process.env } = {}) {
    const defaultIterations = getDefaultMemoryIterations();
    const defaultCommonNodeLimit = getAstCommonNodeTypeLimit();
    const suiteListDescription = formatMemorySuiteNameList();
    const suiteOptionDescription = [
        "Memory suite to run (can be provided multiple times).",
        `Available suites: ${suiteListDescription}.`,
        "Defaults to all suites when omitted."
    ].join(" ");
    const suiteOption = new Option("-s, --suite <name>", suiteOptionDescription)
        .argParser(collectSuite)
        .default([], "all available suites");

    const command = applyStandardCommandOptions(
        new Command()
            .name("memory")
            .usage("[options]")
            .description("Run memory usage diagnostics for CLI utilities.")
    )
        .addOption(suiteOption)
        .option(
            "-i, --iterations <count>",
            "Iteration count for suites that support it.",
            wrapInvalidArgumentResolver(resolveMemoryIterations),
            defaultIterations
        )
        .option(
            "--common-node-limit <count>",
            "Maximum number of AST node types to include in summaries.",
            wrapInvalidArgumentResolver(resolveAstCommonNodeTypeLimit),
            defaultCommonNodeLimit
        )
        .option(
            "--format <format>",
            "Output format: json or human.",
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

interface MemoryCommandOptions {
    suite?: Array<string> | string;
    iterations?: unknown;
    commonNodeLimit?: unknown;
    format?: string;
    pretty?: boolean;
}

interface RunMemoryCommandContext {
    command?: CommanderCommandLike;
    onResults?: (context: {
        payload: ReturnType<typeof createSuiteResultsPayload>;
        suites: Record<string, unknown>;
        options: MemoryCommandOptions;
    }) => unknown | Promise<unknown>;
}

function collectSuiteOptions(options: MemoryCommandOptions) {
    return {
        iterations: options.iterations,
        commonNodeLimit: options.commonNodeLimit
    };
}

function createCountingSet(
    originalSet: SetConstructor,
    allocationCounter: { count: number }
) {
    return class CountingSet<T = unknown> extends originalSet<T> {
        static get [Symbol.species]() {
            return originalSet;
        }

        constructor(...args) {
            super(...args);
            allocationCounter.count += 1;
        }
    };
}

async function runNormalizeStringListSuite({ iterations }) {
    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const measurement = await tracker.measure(() => {
        const originalSet = globalThis.Set;
        const allocationCounter = { count: 0 };
        const CountingSet = createCountingSet(originalSet, allocationCounter);

        globalThis.Set = CountingSet;

        try {
            const sampleValues = Array.from(
                { length: 64 },
                (_, index) => `value_${index % 16}`
            );
            const uniqueValueCount = new Set(sampleValues).size;
            const sampleString = sampleValues.join(", ");

            let totalLength = 0;
            for (let index = 0; index < iterations; index += 1) {
                const result = normalizeStringList(sampleString);
                totalLength += result.length;
            }

            const averageLength =
                iterations > 0 ? totalLength / iterations : totalLength;

            return {
                description:
                    "Normalizes comma-delimited CLI string options using Set-based deduplication.",
                iterations,
                requestedIterations: iterations,
                sample: {
                    uniqueValues: uniqueValueCount,
                    stringLength: sampleString.length
                },
                totalLength,
                averageLength,
                totals: {
                    totalLength,
                    averageLength
                },
                setAllocations: allocationCounter.count
            };
        } finally {
            globalThis.Set = originalSet;
        }
    });

    return buildSuiteResult({ measurement });
}

AVAILABLE_SUITES.set(
    MemorySuiteName.NORMALIZE_STRING_LIST,
    runNormalizeStringListSuite
);

async function runParserAstSuite({ iterations }) {
    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const requestedIterations = typeof iterations === "number" ? iterations : 1;
    const effectiveIterations = Math.max(
        1,
        Math.min(requestedIterations, getMaxParserIterations())
    );

    const { contents: source, path: samplePath } = await loadSampleText(
        "parser:sample",
        PARSER_SAMPLE_RELATIVE_PATH
    );

    const GMLParser = await loadGmlParser();

    const measurement = await tracker.measure(() => {
        let lastAst = null;
        for (let index = 0; index < effectiveIterations; index += 1) {
            lastAst = GMLParser.parse(source, {
                getComments: true,
                getLocations: true,
                simplifyLocations: true
            });
        }

        const astSummary = summarizeAst(lastAst);
        const sampleBytes = Buffer.byteLength(source, "utf8");

        return {
            description:
                "Parses a representative GameMaker script into the internal AST.",
            iterations: effectiveIterations,
            requestedIterations,
            notes:
                effectiveIterations === requestedIterations
                    ? undefined
                    : [
                          `Iterations clamped to ${effectiveIterations} (requested ${requestedIterations}).`
                      ],
            sample: {
                path: path.relative(PROJECT_ROOT, samplePath),
                bytes: sampleBytes,
                lines: countLines(source)
            },
            ast: astSummary
        };
    });

    return buildSuiteResult({ measurement });
}

AVAILABLE_SUITES.set(MemorySuiteName.PARSER_AST, runParserAstSuite);

async function runPluginFormatSuite({ iterations }) {
    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const requestedIterations = typeof iterations === "number" ? iterations : 1;
    const maxIterations = getMaxFormatIterations();
    const effectiveIterations = Math.max(
        1,
        Math.min(requestedIterations, maxIterations)
    );

    const notes = [];
    if (effectiveIterations !== requestedIterations) {
        notes.push(
            `Iterations clamped to ${effectiveIterations} (requested ${requestedIterations}).`
        );
    }

    const { contents: source, path: sampleAbsolutePath } = await loadSampleText(
        "formatter:sample",
        FORMAT_SAMPLE_RELATIVE_PATH
    );

    const optionsAbsolutePath = resolveProjectPath(
        FORMAT_OPTIONS_RELATIVE_PATH
    );
    let optionOverrides = {};
    try {
        const optionsRaw = await readFile(optionsAbsolutePath, "utf8");
        optionOverrides = parseFormatterOptionsFixture(optionsRaw, {
            source: optionsAbsolutePath
        });
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            notes.push(
                "Formatter options fixture not found; using plugin defaults."
            );
        } else {
            throw error;
        }
    }

    const prettier = await loadPrettierStandalone();
    const pluginModule = await importPluginModule();

    const formatOptions = {
        ...pluginModule.defaultOptions,
        ...optionOverrides,
        parser: "gml-parse",
        plugins: [pluginModule],
        filepath: sampleAbsolutePath
    };

    const measurement = await tracker.measure(async () => {
        let lastOutput = "";
        for (let index = 0; index < effectiveIterations; index += 1) {
            lastOutput = await prettier.format(source, formatOptions);
        }

        const sampleBytes = Buffer.byteLength(source, "utf8");
        const outputBytes = Buffer.byteLength(lastOutput, "utf8");

        return {
            description:
                "Formats a complex GameMaker script using the Prettier plugin printers.",
            iterations: effectiveIterations,
            requestedIterations,
            notes: notes.length > 0 ? [...notes] : undefined,
            sample: {
                path: sampleAbsolutePath,
                bytes: sampleBytes,
                lines: countLines(source)
            },
            output: {
                bytes: outputBytes,
                changed: lastOutput !== source,
                deltaBytes: outputBytes - sampleBytes
            },
            options: {
                printWidth: formatOptions.printWidth,
                tabWidth: formatOptions.tabWidth,
                semi: formatOptions.semi
            }
        };
    });

    const result = buildSuiteResult({ measurement });
    if (result?.sample?.path) {
        result.sample.path = path.relative(PROJECT_ROOT, result.sample.path);
    }

    return result;
}

AVAILABLE_SUITES.set(MemorySuiteName.PLUGIN_FORMAT, runPluginFormatSuite);

function formatSuiteError(error: unknown) {
    const errorLike =
        error && typeof error === "object"
            ? (error as {
                  name?: unknown;
                  stack?: unknown;
                  constructor?: { name?: unknown };
              })
            : null;
    const name =
        typeof errorLike?.name === "string"
            ? errorLike.name
            : typeof errorLike?.constructor?.name === "string"
              ? errorLike.constructor.name
              : "Error";
    const message = getErrorMessageOrFallback(error);
    const stackLines =
        typeof errorLike?.stack === "string"
            ? errorLike.stack.split("\n")
            : undefined;

    return {
        name,
        message,
        stack: stackLines
    };
}

interface MemorySuitePayload {
    error?: unknown;
    [key: string]: unknown;
}

/**
 * Convert suite results into the newline-delimited lines printed when JSON
 * output is disabled. Keeps the formatting logic centralized without the
 * layering of the previous mini-pipeline helpers.
 */
function createHumanReadableMemoryLines(
    results: Record<string, MemorySuitePayload> | null | undefined
) {
    const lines = ["Memory benchmark results:"];

    for (const [suite, payload] of Object.entries(results ?? {})) {
        lines.push(`\n• ${suite}`);

        if (payload?.error) {
            const message = getErrorMessageOrFallback(payload.error);
            lines.push(`  - error: ${message}`);
            continue;
        }

        lines.push(`  - result: ${JSON.stringify(payload)}`);
    }

    return lines;
}

function printHumanReadable(results) {
    const lines = createHumanReadableMemoryLines(results);
    console.log(lines.join("\n"));
}

export async function runMemoryCommand({
    command,
    onResults
}: RunMemoryCommandContext = {}) {
    const options: MemoryCommandOptions = command?.opts?.() ?? {};

    if (Number.isFinite(options.commonNodeLimit)) {
        setAstCommonNodeTypeLimit(options.commonNodeLimit);
    }

    const requestedSuites = resolveRequestedSuites(options, AVAILABLE_SUITES);
    ensureSuitesAreKnown(requestedSuites, AVAILABLE_SUITES, command);

    const suiteResults = await collectSuiteResults({
        suiteNames: requestedSuites,
        availableSuites: AVAILABLE_SUITES,
        runnerOptions: collectSuiteOptions(options),
        onError: (error) => ({ error: formatSuiteError(error) })
    });

    const payload = createSuiteResultsPayload(suiteResults);

    if (typeof onResults === "function") {
        await onResults({
            payload,
            suites: suiteResults,
            options
        });
    }

    const emittedJson = emitSuiteResultsJson(suiteResults, options, {
        payload
    });
    if (!emittedJson) {
        printHumanReadable(suiteResults);
    }

    return 0;
}

/**
 * Resolve the absolute file path where the memory CLI should write its JSON
 * report. Keeps the path arithmetic separate from the high-level orchestration
 * in {@link runMemoryCli} so that entry point focuses on coordinating steps.
 */
function resolveMemoryReportPath({
    cwd,
    reportDir,
    reportFileName
}: MemoryReportPathOptions) {
    const effectiveReportDir = resolveMemoryReportDirectory(reportDir);
    const resolvedReportDir = path.resolve(cwd, effectiveReportDir);
    const resolvedReportName = reportFileName ?? DEFAULT_MEMORY_REPORT_FILENAME;

    return path.join(resolvedReportDir, resolvedReportName);
}

/**
 * Create the callback responsible for persisting CLI results to disk. This
 * isolates the conditional writeFile selection, ensuring {@link runMemoryCli}
 * reads as a sequence of delegated operations.
 */
function createMemoryReportWriter({
    reportPath,
    customWriteFile
}: MemoryReportWriterOptions) {
    const writeFile =
        typeof customWriteFile === "function" ? customWriteFile : undefined;

    return async function writeMemoryReport({ payload }) {
        await writeJsonArtifact({
            outputPath: reportPath,
            payload,
            space: 2,
            writeFile
        });
    };
}

interface MemoryCliOptions {
    argv?: Array<string>;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    reportDir?: string | null;
    reportFileName?: string;
    writeFile?: (
        file: PathLike | FileHandle,
        data:
            | string
            | Stream
            | ArrayBufferView<ArrayBufferLike>
            | Iterable<string | ArrayBufferView<ArrayBufferLike>>
            | AsyncIterable<string | ArrayBufferView<ArrayBufferLike>>,
        options?: WriteFileOptions
    ) => Promise<void>;
}

export async function runMemoryCli({
    argv = process.argv.slice(2),
    env = process.env,
    cwd = process.cwd(),
    reportDir,
    reportFileName = DEFAULT_MEMORY_REPORT_FILENAME,
    writeFile: customWriteFile
}: MemoryCliOptions = {}) {
    const command = createMemoryCommand({ env });

    await command.parseAsync(argv, { from: "user" });

    applyMemoryReportDirectoryEnvOverride(env);

    const reportPath = resolveMemoryReportPath({
        cwd,
        reportDir,
        reportFileName
    });
    const writeReport = createMemoryReportWriter({
        reportPath,
        customWriteFile
    });
    await runMemoryCommand({
        command,
        onResults: writeReport
    });

    return 0;
}

export const __test__ = Object.freeze({
    collectCommonNodeTypes,
    SAMPLE_CACHE_MAX_ENTRIES,
    loadSampleTextForTests: loadSampleText,
    clearSampleCacheForTests: clearSampleCache,
    getSampleCacheLabelsForTests: getSampleCacheLabels
});
