import path from "node:path";
import process from "node:process";
import { readFile, writeFile as writeFileAsync } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Command, InvalidArgumentError } from "commander";

import {
    assertPlainObject,
    createEnvConfiguredValue,
    ensureDir,
    getErrorMessage,
    normalizeStringList,
    parseJsonWithContext
} from "./shared-deps.js";
import { applyStandardCommandOptions } from "./command-standard-options.js";
import {
    coercePositiveInteger,
    resolveIntegerOption,
    wrapInvalidArgumentResolver
} from "./command-parsing.js";
import { applyEnvOptionOverrides } from "./env-overrides.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "./numeric-option-state.js";
import {
    SuiteOutputFormat,
    resolveSuiteOutputFormatOrThrow,
    emitSuiteResults as emitSuiteResultsJson,
    collectSuiteResults,
    ensureSuitesAreKnown,
    resolveRequestedSuites,
    createSuiteResultsPayload
} from "./command-suite-helpers.js";

export const DEFAULT_ITERATIONS = 500_000;
export const MEMORY_ITERATIONS_ENV_VAR = "GML_MEMORY_ITERATIONS";

const DEFAULT_MEMORY_REPORT_DIR = "test-results";
const DEFAULT_MEMORY_REPORT_FILENAME = "memory.json";
const CLI_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(CLI_MODULE_DIR, "../../..");

const PARSER_SAMPLE_RELATIVE_PATH = "src/parser/tests/input/SnowState.gml";
const FORMAT_SAMPLE_RELATIVE_PATH = "src/plugin/tests/testFormatting.input.gml";
const FORMAT_OPTIONS_RELATIVE_PATH =
    "src/plugin/tests/testFormatting.options.json";
const PLUGIN_ENTRY_RELATIVE_PATH = "src/plugin/src/gml.js";

export const MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR =
    "GML_MEMORY_PARSER_MAX_ITERATIONS";
export const DEFAULT_MAX_PARSER_ITERATIONS = 25;
const MAX_FORMAT_ITERATIONS = 25;

const parserIterationLimitConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_MAX_PARSER_ITERATIONS,
    envVar: MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
    normalize: (value, { defaultValue, previousValue }) =>
        normalizeParserIterationLimit(value, {
            fallback:
                previousValue ?? defaultValue ?? DEFAULT_MAX_PARSER_ITERATIONS
        })
});

const sampleCache = new Map();

function resolveProjectPath(relativePath) {
    return path.resolve(PROJECT_ROOT, relativePath);
}

async function loadPrettierStandalone() {
    const module = await import("prettier/standalone.mjs");
    return module?.default ?? module;
}

async function loadSampleText(label, relativePath) {
    if (sampleCache.has(label)) {
        return sampleCache.get(label);
    }

    const absolutePath = resolveProjectPath(relativePath);
    const contents = await readFile(absolutePath, "utf8");
    const record = { contents, path: absolutePath };
    sampleCache.set(label, record);
    return record;
}

function describeFormatterOptionsValue(value) {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "an array";
    }

    const type = typeof value;
    if (type === "undefined") {
        return "undefined";
    }

    if (type === "object") {
        const tag = Object.prototype.toString.call(value);
        const match = /^\[object (\w+)\]$/.exec(tag);
        if (match && match[1] !== "Object") {
            const label = match[1];
            const article = /^[AEIOU]/i.test(label) ? "an" : "a";
            return `${article} ${label} object`;
        }

        return "an object";
    }

    const article = /^[aeiou]/i.test(type) ? "an" : "a";
    return `${article} ${type}`;
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
export function parseFormatterOptionsFixture(optionsRaw, { source } = {}) {
    const payload = parseJsonWithContext(optionsRaw, {
        source,
        description: "formatter options fixture"
    });

    return assertPlainObject(payload, {
        errorMessage: buildFormatterOptionsTypeErrorMessage(source, payload)
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

    const delta = {};
    for (const [key, beforeValue] of Object.entries(baseline)) {
        const afterValue = current[key];
        if (typeof beforeValue === "number" && typeof afterValue === "number") {
            delta[key] = afterValue - beforeValue;
        }
    }
    return delta;
}

function normalizeDelta(delta, iterations) {
    if (!delta || !iterations || iterations <= 0) {
        return null;
    }

    const normalized = {};
    for (const [key, value] of Object.entries(delta)) {
        if (typeof value === "number") {
            normalized[key] = value / iterations;
        }
    }
    return normalized;
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
        (warning) => typeof warning === "string" && warning.length > 0
    );

    if (mergedWarnings.length > 0) {
        response.warnings = [...new Set(mergedWarnings)];
    }

    return response;
}

function countLines(text) {
    if (typeof text !== "string" || text.length === 0) {
        return 0;
    }

    return text.split(/\r?\n/).length;
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
            typeCounts.set(value.type, (typeCounts.get(value.type) ?? 0) + 1);
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

    const commonNodeTypes = [...typeCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

    return {
        nodeCount,
        arrayCount,
        maxDepth,
        commentCount,
        commonNodeTypes
    };
}

const createIterationErrorMessage = (received) =>
    `Iteration count must be a positive integer (received ${received}).`;

const createIterationTypeErrorMessage = (type) =>
    `Iteration count must be provided as a number (received type '${type}').`;

const coerceMemoryIterations = createIntegerOptionCoercer({
    baseCoerce: coercePositiveInteger,
    createErrorMessage: createIterationErrorMessage
});

const memoryIterationsState = createIntegerOptionState({
    defaultValue: DEFAULT_ITERATIONS,
    envVar: MEMORY_ITERATIONS_ENV_VAR,
    coerce: coerceMemoryIterations,
    typeErrorMessage: createIterationTypeErrorMessage
});

const {
    getDefault: getDefaultMemoryIterations,
    setDefault: setDefaultMemoryIterations,
    resolve: resolveMemoryIterationsState,
    applyEnvOverride: applyMemoryIterationsEnvOverride
} = memoryIterationsState;

function normalizeParserIterationLimit(value, { fallback }) {
    const baseline = fallback ?? DEFAULT_MAX_PARSER_ITERATIONS;

    try {
        const normalized = resolveIntegerOption(value, {
            defaultValue: baseline,
            coerce: coerceMemoryIterations,
            typeErrorMessage: createIterationTypeErrorMessage
        });

        return normalized ?? baseline;
    } catch {
        return baseline;
    }
}

function getMaxParserIterations() {
    return parserIterationLimitConfig.get();
}

function setMaxParserIterations(value) {
    return parserIterationLimitConfig.set(value);
}

function applyParserMaxIterationsEnvOverride(env) {
    return parserIterationLimitConfig.applyEnvOverride(env);
}

export {
    getDefaultMemoryIterations,
    setDefaultMemoryIterations,
    applyMemoryIterationsEnvOverride,
    getMaxParserIterations,
    setMaxParserIterations,
    applyParserMaxIterationsEnvOverride
};

export function resolveMemoryIterations(rawValue, { defaultIterations } = {}) {
    return resolveMemoryIterationsState(rawValue, {
        defaultValue: defaultIterations
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
applyParserMaxIterationsEnvOverride();

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

AVAILABLE_SUITES.set("normalize-string-list", runNormalizeStringListSuite);

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

    const { default: GMLParser } = await import("../../parser/gml-parser.js");

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

AVAILABLE_SUITES.set("parser-ast", runParserAstSuite);

async function runPluginFormatSuite({ iterations }) {
    const tracker = createMemoryTracker({ requirePreciseGc: true });
    const requestedIterations = typeof iterations === "number" ? iterations : 1;
    const effectiveIterations = Math.max(
        1,
        Math.min(requestedIterations, MAX_FORMAT_ITERATIONS)
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
        if (error && error.code === "ENOENT") {
            notes.push(
                "Formatter options fixture not found; using plugin defaults."
            );
        } else {
            throw error;
        }
    }

    const prettier = await loadPrettierStandalone();
    const pluginModule = await import(
        pathToFileURL(resolveProjectPath(PLUGIN_ENTRY_RELATIVE_PATH)).href
    );

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

AVAILABLE_SUITES.set("plugin-format", runPluginFormatSuite);

function formatSuiteError(error) {
    const name = error?.name ?? error?.constructor?.name ?? "Error";
    const message = getErrorMessage(error, { fallback: "" }) || "Unknown error";
    const stackLines =
        typeof error?.stack === "string" ? error.stack.split("\n") : undefined;

    return {
        name,
        message,
        stack: stackLines
    };
}

function printHumanReadable(results) {
    const lines = ["Memory benchmark results:"];
    for (const [suite, payload] of Object.entries(results)) {
        lines.push(`\n• ${suite}`);
        if (payload?.error) {
            lines.push(
                `  - error: ${payload.error.message || "Unknown error"}`
            );
            continue;
        }

        lines.push(`  - result: ${JSON.stringify(payload)}`);
    }

    console.log(lines.join("\n"));
}

export async function runMemoryCommand({ command, onResults } = {}) {
    const options = command?.opts?.() ?? {};

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

export async function runMemoryCli({
    argv = process.argv.slice(2),
    env = process.env,
    cwd = process.cwd(),
    reportDir = DEFAULT_MEMORY_REPORT_DIR,
    reportFileName = DEFAULT_MEMORY_REPORT_FILENAME,
    writeFile: customWriteFile
} = {}) {
    const command = createMemoryCommand({ env });

    await command.parseAsync(argv, { from: "user" });

    const resolvedReportDir = path.resolve(
        cwd,
        reportDir ?? DEFAULT_MEMORY_REPORT_DIR
    );
    const resolvedReportName = reportFileName ?? DEFAULT_MEMORY_REPORT_FILENAME;
    const reportPath = path.join(resolvedReportDir, resolvedReportName);
    const effectiveWriteFile =
        typeof customWriteFile === "function"
            ? customWriteFile
            : writeFileAsync;

    await runMemoryCommand({
        command,
        onResults: async ({ payload }) => {
            await ensureDir(resolvedReportDir);
            const reportContents = `${JSON.stringify(payload, null, 2)}\n`;
            await effectiveWriteFile(reportPath, reportContents, "utf8");
        }
    });

    return 0;
}
