import path from "node:path";
import process from "node:process";
import { readFile, type FileHandle } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { PathLike, WriteFileOptions } from "node:fs";
import type { Stream } from "node:stream";

import { Command, Option, InvalidArgumentError } from "commander";
import { Core } from "@gml-modules/core";
import { resolveModuleDefaultExport } from "../../shared/module.js";
import {
    SuiteOutputFormat,
    collectSuiteResults,
    createSuiteResultsPayload,
    emitSuiteResults as emitSuiteResultsJson,
    ensureSuitesAreKnown,
    resolveRequestedSuites,
    resolveSuiteOutputFormatOrThrow
} from "../../cli-core/command-suite-helpers.js";
import { applyEnvOptionOverrides } from "../../cli-core/env-overrides.js";
import { applyStandardCommandOptions } from "../../cli-core/command-standard-options.js";
import { coercePositiveInteger, wrapInvalidArgumentResolver } from "../../cli-core/command-parsing.js";
import { isCommanderHelpDisplayedError } from "../../cli-core/commander-error-utils.js";
import { REPO_ROOT, resolveFromRepoRoot } from "../../shared/workspace-paths.js";
import { writeJsonArtifact } from "../../shared/fs-artifacts.js";
import { Parser } from "@gml-modules/parser";
import { importPluginModule } from "../plugin-runtime-dependencies.js";
import type { CommanderCommandLike } from "../../cli-core/commander-types.js";

const {
    appendToCollection,
    callWithFallback,
    coercePositiveInteger: coreCoercePositiveInteger,
    createEnumeratedOptionHelpers,
    createEnvConfiguredValue,
    describeValueWithArticle,
    getErrorMessageOrFallback,
    getNonEmptyTrimmedString,
    incrementMapValue,
    isFsErrorCode,
    isNonEmptyString,
    normalizeStringList,
    parseJsonObjectWithContext,
    resolveIntegerOption,
    splitLines,
    createNumericTypeErrorFormatter
} = Core;

export const DEFAULT_ITERATIONS = 500_000;
export const MEMORY_ITERATIONS_ENV_VAR = "GML_MEMORY_ITERATIONS";

export const DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT = 5;
export const MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR = "GML_MEMORY_AST_COMMON_NODE_LIMIT";

export const DEFAULT_MEMORY_REPORT_DIR = "reports";
export const DEFAULT_MEMORY_REPORT_FILENAME = "memory.json";
const PROJECT_ROOT = REPO_ROOT;

const PARSER_SAMPLE_RELATIVE_PATH = "src/parser/test/input/SnowState.gml";
const FORMAT_SAMPLE_RELATIVE_PATH = "src/plugin/test/testFormatting.input.gml";
const FORMAT_OPTIONS_RELATIVE_PATH = "src/plugin/test/testFormatting.options.json";
export const MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR = "GML_MEMORY_PARSER_MAX_ITERATIONS";
export const DEFAULT_MAX_PARSER_ITERATIONS = 25;
export const MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR = "GML_MEMORY_FORMAT_MAX_ITERATIONS";
export const DEFAULT_MAX_FORMAT_ITERATIONS = 25;
export const MEMORY_REPORT_DIRECTORY_ENV_VAR = "GML_MEMORY_REPORT_DIR";
export const MEMORY_REPORT_FILENAME_ENV_VAR = "GML_MEMORY_REPORT_FILENAME";

export const MemorySuiteName = Object.freeze({
    NORMALIZE_STRING_LIST: "normalize-string-list",
    PARSER_AST: "parser-ast",
    PLUGIN_FORMAT: "plugin-format"
});

const memorySuiteHelpers = createEnumeratedOptionHelpers(Object.values(MemorySuiteName), {
    formatError: (list, received) => `Memory suite must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Memory suite name"
});

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

export function normalizeMemorySuiteName(value: unknown, { errorConstructor }: NormalizeMemorySuiteNameOptions = {}) {
    return memorySuiteHelpers.requireValue(value, errorConstructor);
}

function normalizeMemoryReportDirectory(value, fallback) {
    return getNonEmptyTrimmedString(value) ?? fallback;
}

const memoryReportDirectoryConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_MEMORY_REPORT_DIR,
    envVar: MEMORY_REPORT_DIRECTORY_ENV_VAR,
    normalize: (value, { defaultValue: baseline, previousValue }) =>
        normalizeMemoryReportDirectory(value, previousValue ?? baseline ?? DEFAULT_MEMORY_REPORT_DIR)
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
    const fallback = normalizeMemoryReportDirectory(defaultValue, getDefaultMemoryReportDirectory());

    return normalizeMemoryReportDirectory(value, fallback);
}

function normalizeMemoryReportFileName(value, fallback) {
    return getNonEmptyTrimmedString(value) ?? fallback;
}

const memoryReportFileNameConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_MEMORY_REPORT_FILENAME,
    envVar: MEMORY_REPORT_FILENAME_ENV_VAR,
    normalize: (value, { defaultValue: baseline, previousValue }) =>
        normalizeMemoryReportFileName(value, previousValue ?? baseline ?? DEFAULT_MEMORY_REPORT_FILENAME)
});

function getDefaultMemoryReportFileName() {
    return memoryReportFileNameConfig.get();
}

function setDefaultMemoryReportFileName(value) {
    return memoryReportFileNameConfig.set(value);
}

interface ResolveMemoryReportFileNameOptions {
    defaultValue?: string | null | undefined;
}

function resolveMemoryReportFileName(value?: string | null, { defaultValue }: ResolveMemoryReportFileNameOptions = {}) {
    const fallback = normalizeMemoryReportFileName(defaultValue, getDefaultMemoryReportFileName());

    return normalizeMemoryReportFileName(value, fallback);
}

function applyMemoryReportFileNameEnvOverride(env) {
    return memoryReportFileNameConfig.applyEnvOverride(env);
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

const createIterationErrorMessage = (received) => `Iteration count must be a positive integer (received ${received}).`;

const createIterationTypeErrorMessage = createNumericTypeErrorFormatter("Iteration count");

const createAstCommonNodeLimitErrorMessage = (received) =>
    `AST common node type limit must be a positive integer (received ${received}).`;

const createAstCommonNodeLimitTypeErrorMessage = createNumericTypeErrorFormatter("AST common node type limit");

interface MemoryIterationEnvOverrideOptions {
    envVar: string;
    error: unknown;
    fallback: number | undefined;
}

// Shared coercion function for iteration counts
const iterationCoerce = (value: unknown, context = {}) => {
    const opts = {
        ...context,
        createErrorMessage: createIterationErrorMessage
    };
    return coercePositiveInteger(value, opts);
};

function createIterationState({ defaultValue, envVar }: { defaultValue: number; envVar: string }) {
    return createEnvConfiguredValue<number | undefined>({
        defaultValue,
        envVar,
        normalize: (value, { defaultValue: baseline, previousValue }) => {
            return resolveIntegerOption(value, {
                defaultValue: baseline ?? previousValue,
                coerce: iterationCoerce,
                typeErrorMessage: createIterationTypeErrorMessage,
                blankStringReturnsDefault: true
            });
        }
    });
}

// Parser iteration limit configuration
const parserIterationState = createIterationState({
    defaultValue: DEFAULT_MAX_PARSER_ITERATIONS,
    envVar: MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR
});

function getMaxParserIterations(): number | undefined {
    return parserIterationState.get();
}

function setMaxParserIterations(value?: unknown): number | undefined {
    return parserIterationState.set(value);
}

function logInvalidIterationEnvOverride({ envVar, error, fallback }: MemoryIterationEnvOverrideOptions) {
    const reason = getErrorMessageOrFallback(error, {
        fallback: `Invalid value provided for ${envVar}.`
    }).trim();
    const suffix = reason.endsWith(".") ? "" : ".";
    const fallbackDetails =
        fallback === undefined ? "Falling back to the previous value." : `Falling back to ${fallback}.`;

    console.warn(`${envVar} override ignored: ${reason}${suffix} ${fallbackDetails}`);
}

/**
 * Apply an environment override for a memory iteration limit while logging
 * failures.
 *
 * @param {() => number | undefined} getDefault Function to retrieve the current default.
 * @param {(env?: NodeJS.ProcessEnv) => number | undefined} applyEnvOverride Function to apply env override.
 * @param {string} envVar Environment variable powering the override.
 * @param {NodeJS.ProcessEnv | null | undefined} env Environment map to read.
 * @returns {number | undefined}
 */
function applyIterationEnvOverride(
    getDefault: () => number | undefined,
    applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined,
    envVar: string,
    env?: NodeJS.ProcessEnv
): number | undefined {
    const fallback = getDefault();
    return callWithFallback(() => applyEnvOverride(env), {
        fallback,
        onError: (error) => logInvalidIterationEnvOverride({ envVar, error, fallback })
    });
}

function applyParserMaxIterationsEnvOverride(env?: NodeJS.ProcessEnv): number | undefined {
    return applyIterationEnvOverride(
        getMaxParserIterations,
        parserIterationState.applyEnvOverride,
        MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
        env
    );
}

// Format iteration limit configuration
const formatIterationState = createIterationState({
    defaultValue: DEFAULT_MAX_FORMAT_ITERATIONS,
    envVar: MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR
});

function getMaxFormatIterations(): number | undefined {
    return formatIterationState.get();
}

function setMaxFormatIterations(value?: unknown): number | undefined {
    return formatIterationState.set(value);
}

function applyFormatMaxIterationsEnvOverride(env?: NodeJS.ProcessEnv): number | undefined {
    return applyIterationEnvOverride(
        getMaxFormatIterations,
        formatIterationState.applyEnvOverride,
        MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR,
        env
    );
}

// AST common node limit configuration
const astCommonNodeLimitCoerce = (value: unknown, context = {}) => {
    const opts = {
        ...context,
        createErrorMessage: createAstCommonNodeLimitErrorMessage
    };
    return coreCoercePositiveInteger(value, opts);
};

const astCommonNodeLimitState = createEnvConfiguredValue<number | undefined>({
    defaultValue: DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
    envVar: MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
    normalize: (value, { defaultValue: baseline, previousValue }) => {
        return resolveIntegerOption(value, {
            defaultValue: baseline ?? previousValue,
            coerce: astCommonNodeLimitCoerce,
            typeErrorMessage: createAstCommonNodeLimitTypeErrorMessage,
            blankStringReturnsDefault: true
        });
    }
});

function getAstCommonNodeTypeLimit(): number | undefined {
    return astCommonNodeLimitState.get();
}

function setAstCommonNodeTypeLimit(value?: unknown): number | undefined {
    return astCommonNodeLimitState.set(value);
}

function applyAstCommonNodeTypeLimitEnvOverride(env?: NodeJS.ProcessEnv): number | undefined {
    return astCommonNodeLimitState.applyEnvOverride(env);
}

function resolveAstCommonNodeTypeLimit(
    rawValue?: unknown,
    options: Record<string, unknown> & { defaultValue?: number } = {}
): number | null | undefined {
    const fallback = options.defaultValue ?? astCommonNodeLimitState.get();
    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: astCommonNodeLimitCoerce,
        typeErrorMessage: createAstCommonNodeLimitTypeErrorMessage,
        blankStringReturnsDefault: true
    });
}

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

export function parseFormatterOptionsFixture(optionsRaw: string, { source }: FormatterOptionsFixtureContext = {}) {
    return parseJsonObjectWithContext(optionsRaw, {
        source,
        description: "formatter options fixture",
        createAssertOptions: (payload) => ({
            errorMessage: buildFormatterOptionsTypeErrorMessage(source, payload)
        })
    });
}

function captureProcessMemory() {
    const { rss = 0, heapTotal = 0, heapUsed = 0, external = 0, arrayBuffers = 0 } = process.memoryUsage();
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
        return typeof afterValue === "number" ? [[key, afterValue - beforeValue]] : [];
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
        warnings.push("Precise heap measurements require Node to be launched with --expose-gc.");
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
                deltaAfterGc: afterGc === null ? null : computeMemoryDelta(afterGc, before),
                durationMs,
                warnings: [...warnings],
                result
            };
        }
    };
}

function buildSuiteResult({ measurement, extraWarnings = [] }) {
    const { before, after, afterGc, delta, deltaAfterGc, durationMs, warnings, result } = measurement;
    const iterations = typeof result?.iterations === "number" && result.iterations > 0 ? result.iterations : null;

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

    const mergedWarnings = [...(warnings ?? []), ...extraWarnings].filter((warning) => isNonEmptyString(warning));

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
    const limit = Number.isFinite(configuredLimit) ? configuredLimit : DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT;

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

    const commentCount = Array.isArray(root.comments) ? root.comments.length : 0;

    const commonNodeTypes = collectCommonNodeTypes(typeCounts);

    return {
        nodeCount,
        arrayCount,
        maxDepth,
        commentCount,
        commonNodeTypes
    };
}

// Memory iterations configuration
const memoryIterationsState = createIterationState({
    defaultValue: DEFAULT_ITERATIONS,
    envVar: MEMORY_ITERATIONS_ENV_VAR
});

function getDefaultMemoryIterations(): number | undefined {
    return memoryIterationsState.get();
}

function setDefaultMemoryIterations(value?: unknown): number | undefined {
    return memoryIterationsState.set(value);
}

function resolveMemoryIterations(
    rawValue?: unknown,
    options: Record<string, unknown> & {
        defaultValue?: number;
        defaultIterations?: number;
    } = {}
): number | null | undefined {
    const fallback = options.defaultIterations ?? options.defaultValue ?? memoryIterationsState.get();
    return resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: iterationCoerce,
        typeErrorMessage: createIterationTypeErrorMessage,
        blankStringReturnsDefault: true
    });
}

function applyMemoryIterationsEnvOverride(env?: NodeJS.ProcessEnv): number | undefined {
    return memoryIterationsState.applyEnvOverride(env);
}

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
    applyMemoryReportDirectoryEnvOverride,
    getDefaultMemoryReportFileName,
    setDefaultMemoryReportFileName,
    applyMemoryReportFileNameEnvOverride
};

export { resolveMemoryIterations, resolveMemoryReportDirectory, resolveMemoryReportFileName };

interface MemoryEnvOptionOverridesContext {
    command?: CommanderCommandLike;
    env?: NodeJS.ProcessEnv;
}

export function applyMemoryEnvOptionOverrides({ command, env }: MemoryEnvOptionOverridesContext = {}) {
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
applyMemoryReportFileNameEnvOverride(process.env);
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
        new Command().name("memory").usage("[options]").description("Run memory usage diagnostics for CLI utilities.")
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
    }) => void | Promise<void>;
}

function collectSuiteOptions(options: MemoryCommandOptions) {
    return {
        iterations: options.iterations,
        commonNodeLimit: options.commonNodeLimit
    };
}

function createCountingSet(originalSet: SetConstructor, allocationCounter: { count: number }) {
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
            const sampleValues = Array.from({ length: 64 }, (_, index) => `value_${index % 16}`);
            const uniqueValueCount = new Set(sampleValues).size;
            const sampleString = sampleValues.join(", ");

            let totalLength = 0;
            for (let index = 0; index < iterations; index += 1) {
                const result = normalizeStringList(sampleString);
                totalLength += result.length;
            }

            const averageLength = iterations > 0 ? totalLength / iterations : totalLength;

            return {
                description: "Normalizes comma-delimited CLI string options using Set-based deduplication.",
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

AVAILABLE_SUITES.set(MemorySuiteName.NORMALIZE_STRING_LIST, runNormalizeStringListSuite);

async function runParserAstSuite({ iterations }) {
    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const requestedIterations = typeof iterations === "number" ? iterations : 1;
    const effectiveIterations = Math.max(1, Math.min(requestedIterations, getMaxParserIterations()));

    const { contents: source, path: samplePath } = await loadSampleText("parser:sample", PARSER_SAMPLE_RELATIVE_PATH);

    const GMLParser = Parser.GMLParser;

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
            description: "Parses a representative GameMaker script into the internal AST.",
            iterations: effectiveIterations,
            requestedIterations,
            notes:
                effectiveIterations === requestedIterations
                    ? undefined
                    : [`Iterations clamped to ${effectiveIterations} (requested ${requestedIterations}).`],
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
    const effectiveIterations = Math.max(1, Math.min(requestedIterations, maxIterations));

    const notes = [];
    if (effectiveIterations !== requestedIterations) {
        notes.push(`Iterations clamped to ${effectiveIterations} (requested ${requestedIterations}).`);
    }

    const { contents: source, path: sampleAbsolutePath } = await loadSampleText(
        "formatter:sample",
        FORMAT_SAMPLE_RELATIVE_PATH
    );

    const optionsAbsolutePath = resolveProjectPath(FORMAT_OPTIONS_RELATIVE_PATH);
    let optionOverrides = {};
    try {
        const optionsRaw = await readFile(optionsAbsolutePath, "utf8");
        optionOverrides = parseFormatterOptionsFixture(optionsRaw, {
            source: optionsAbsolutePath
        });
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            notes.push("Formatter options fixture not found; using plugin defaults.");
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
            description: "Formats a complex GameMaker script using the Prettier plugin printers.",
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
              })
            : null;
    const name = typeof errorLike?.name === "string" ? errorLike.name : "Error";
    const message = getErrorMessageOrFallback(error);
    const stackLines = typeof errorLike?.stack === "string" ? errorLike.stack.split("\n") : undefined;

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
 * Format a byte count into a human-readable string with appropriate units.
 *
 * @param {number | null | undefined} bytes Number of bytes to format.
 * @returns {string} Formatted string with appropriate unit (B, KB, MB, GB).
 */
function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
        return "N/A";
    }

    const absoluteBytes = Math.abs(bytes);
    const sign = bytes < 0 ? "-" : "";

    if (absoluteBytes < 1024) {
        return `${sign}${absoluteBytes.toFixed(0)} B`;
    }

    if (absoluteBytes < 1024 * 1024) {
        return `${sign}${(absoluteBytes / 1024).toFixed(2)} KB`;
    }

    if (absoluteBytes < 1024 * 1024 * 1024) {
        return `${sign}${(absoluteBytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    return `${sign}${(absoluteBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format a duration in milliseconds into a human-readable string.
 *
 * @param {number | null | undefined} ms Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) {
        return "N/A";
    }

    if (ms < 1) {
        return `${ms.toFixed(3)} ms`;
    }

    if (ms < 1000) {
        return `${ms.toFixed(2)} ms`;
    }

    return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Format a signed delta value with appropriate sign prefix.
 *
 * @param {number} value The delta value to format.
 * @param {(value: number) => string} formatter Function to format the absolute value.
 * @returns {string} Formatted string with sign prefix.
 */
function formatDelta(value: number, formatter: (value: number) => string): string {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${formatter(value)}`;
}

/**
 * Extract heap delta per iteration from a memory payload.
 *
 * @param {MemorySuitePayload} payload The suite result payload.
 * @returns {number | null} Heap delta per iteration or null if unavailable.
 */
function extractHeapDeltaPerIteration(payload: MemorySuitePayload): number | null {
    if (typeof payload.memory !== "object" || payload.memory === null) {
        return null;
    }

    const memory = payload.memory as Record<string, unknown>;
    if (typeof memory.deltaPerIteration !== "object" || memory.deltaPerIteration === null) {
        return null;
    }

    const deltaPerIter = memory.deltaPerIteration as Record<string, unknown>;
    return typeof deltaPerIter.heapUsed === "number" ? deltaPerIter.heapUsed : null;
}

/**
 * Format memory suite payload into human-readable lines.
 *
 * @param {MemorySuitePayload} payload The suite result payload.
 * @returns {Array<string>} Array of formatted lines describing the result.
 */
function formatMemorySuitePayload(payload: MemorySuitePayload): Array<string> {
    const lines: Array<string> = [];

    if (payload.description && typeof payload.description === "string") {
        lines.push(`  Description: ${payload.description}`);
    }

    if (typeof payload.iterations === "number") {
        lines.push(`  Iterations: ${payload.iterations.toLocaleString()}`);
    }

    if (typeof payload.durationMs === "number") {
        lines.push(`  Duration: ${formatDuration(payload.durationMs)}`);
    }

    if (typeof payload.heapUsedBefore === "number" && typeof payload.heapUsedAfter === "number") {
        lines.push(`  Heap before: ${formatBytes(payload.heapUsedBefore)}`);
        lines.push(`  Heap after: ${formatBytes(payload.heapUsedAfter)}`);

        if (typeof payload.heapDelta === "number") {
            lines.push(`  Heap delta: ${formatDelta(payload.heapDelta, formatBytes)}`);
        }
    }

    if (
        typeof payload.rssBefore === "number" &&
        typeof payload.rssAfter === "number" &&
        payload.rssBefore !== payload.rssAfter &&
        typeof payload.rssDelta === "number"
    ) {
        lines.push(`  RSS delta: ${formatDelta(payload.rssDelta, formatBytes)}`);
    }

    const heapPerIteration = extractHeapDeltaPerIteration(payload);
    if (heapPerIteration !== null) {
        lines.push(`  Heap per iteration: ${formatDelta(heapPerIteration, formatBytes)}`);
    }

    if (Array.isArray(payload.warnings) && payload.warnings.length > 0) {
        lines.push(`  Warnings:`);
        for (const warning of payload.warnings) {
            lines.push(`    - ${warning}`);
        }
    }

    return lines;
}

/**
 * Convert suite results into the newline-delimited lines printed when JSON
 * output is disabled. Keeps the formatting logic centralized without the
 * layering of the previous mini-pipeline helpers.
 */
function createHumanReadableMemoryLines(results: Record<string, MemorySuitePayload> | null | undefined) {
    const lines = ["Memory benchmark results:"];

    for (const [suite, payload] of Object.entries(results ?? {})) {
        lines.push(`\n• ${suite}`);

        if (payload?.error) {
            const message = getErrorMessageOrFallback(payload.error);
            lines.push(`  Error: ${message}`);
            continue;
        }

        const formattedLines = formatMemorySuitePayload(payload);
        lines.push(...formattedLines);
    }

    return lines;
}

function printHumanReadable(results) {
    const lines = createHumanReadableMemoryLines(results);
    console.log(lines.join("\n"));
}

export async function runMemoryCommand({ command, onResults }: RunMemoryCommandContext = {}) {
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
function resolveMemoryReportPath({ cwd, reportDir, reportFileName }: MemoryReportPathOptions) {
    const effectiveReportDir = resolveMemoryReportDirectory(reportDir);
    const resolvedReportDir = path.resolve(cwd, effectiveReportDir);
    const resolvedReportName = resolveMemoryReportFileName(reportFileName);

    return path.join(resolvedReportDir, resolvedReportName);
}

/**
 * Create the callback responsible for persisting CLI results to disk. This
 * isolates the conditional writeFile selection, ensuring {@link runMemoryCli}
 * reads as a sequence of delegated operations.
 */
function createMemoryReportWriter({ reportPath, customWriteFile }: MemoryReportWriterOptions) {
    const writeFile = typeof customWriteFile === "function" ? customWriteFile : undefined;

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
    reportFileName,
    writeFile: customWriteFile
}: MemoryCliOptions = {}) {
    const command = createMemoryCommand({ env });

    try {
        await command.parseAsync(argv, { from: "user" });
    } catch (error) {
        if (isCommanderHelpDisplayedError(error)) {
            return 0;
        }
        throw error;
    }

    applyMemoryReportFileNameEnvOverride(env);
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
