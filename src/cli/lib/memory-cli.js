import path from "node:path";
import process from "node:process";
import { writeFile as writeFileAsync } from "node:fs/promises";

import { Command, InvalidArgumentError } from "commander";

import {
    getErrorMessage,
    normalizeStringList,
    ensureDir
} from "./shared-deps.js";
import { applyStandardCommandOptions } from "./command-standard-options.js";
import {
    coercePositiveInteger,
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

export {
    getDefaultMemoryIterations,
    setDefaultMemoryIterations,
    applyMemoryIterationsEnvOverride
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
    const originalSet = globalThis.Set;
    const allocationCounter = { count: 0 };
    const CountingSet = createCountingSet(originalSet, allocationCounter);
    const gc = typeof globalThis.gc === "function" ? globalThis.gc : null;

    const runGc = () => {
        if (gc) {
            gc();
        }
    };

    globalThis.Set = CountingSet;

    try {
        const sampleValues = Array.from(
            { length: 64 },
            (_, index) => `value_${index % 16}`
        );
        const sampleString = sampleValues.join(", ");

        runGc();
        const before = process.memoryUsage().heapUsed;

        let totalLength = 0;
        for (let index = 0; index < iterations; index += 1) {
            const result = normalizeStringList(sampleString);
            totalLength += result.length;
        }

        const after = process.memoryUsage().heapUsed;

        let afterGc = null;
        if (gc) {
            runGc();
            afterGc = process.memoryUsage().heapUsed;
        }

        const warnings = [];
        if (!gc) {
            warnings.push(
                "Precise heap measurements require Node to be launched with --expose-gc."
            );
        }

        const result = {
            iterations,
            totalLength,
            heapUsedBefore: before,
            heapUsedAfter: after,
            heapDelta: after - before,
            heapUsedAfterGc: afterGc,
            heapDeltaAfterGc:
                typeof afterGc === "number" ? afterGc - before : null,
            setAllocations: allocationCounter.count
        };
        if (warnings.length > 0) {
            result.warnings = warnings;
        }

        return result;
    } finally {
        globalThis.Set = originalSet;
    }
}

AVAILABLE_SUITES.set("normalize-string-list", runNormalizeStringListSuite);

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
