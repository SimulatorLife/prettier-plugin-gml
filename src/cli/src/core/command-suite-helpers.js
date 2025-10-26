import process from "node:process";

import { CliUsageError, createCliErrorDetails } from "./errors.js";
// Pull shared helpers from the barrel so new call sites avoid the legacy
// `array-utils` shim slated for removal.
import {
    normalizeEnumeratedOption,
    isNonEmptyArray,
    resolveCommandUsage,
    toMutableArray,
    stringifyJsonForFile
} from "../shared/dependencies.js";

export const SuiteOutputFormat = Object.freeze({
    JSON: "json",
    HUMAN: "human"
});

const VALID_SUITE_OUTPUT_FORMATS = new Set(Object.values(SuiteOutputFormat));

const SUITE_OUTPUT_FORMAT_LIST = [...VALID_SUITE_OUTPUT_FORMATS]
    .sort()
    .join(", ");

export function formatSuiteOutputFormatList() {
    return SUITE_OUTPUT_FORMAT_LIST;
}

export function normalizeSuiteOutputFormat(value, { fallback } = {}) {
    return normalizeEnumeratedOption(
        value,
        fallback ?? null,
        VALID_SUITE_OUTPUT_FORMATS
    );
}

export function resolveSuiteOutputFormatOrThrow(
    value,
    { fallback, errorConstructor, createErrorMessage } = {}
) {
    const normalized = normalizeSuiteOutputFormat(value, { fallback });

    if (normalized) {
        return normalized;
    }

    const ErrorConstructor =
        typeof errorConstructor === "function" ? errorConstructor : Error;
    const customMessage =
        typeof createErrorMessage === "function"
            ? createErrorMessage(value)
            : createErrorMessage;
    const message =
        customMessage == null
            ? `Format must be one of: ${formatSuiteOutputFormatList()}.`
            : String(customMessage);

    throw new ErrorConstructor(message);
}

/**
 * Normalize the requested suite names for execution.
 *
 * @param {{ suite: Array<string> }} options
 * @param {Map<string, unknown>} availableSuites
 * @returns {Array<string>}
 */
export function resolveRequestedSuites(options, availableSuites) {
    const suiteOption = toMutableArray(options?.suite);
    const hasExplicitSuites = suiteOption.length > 0;
    const requested = hasExplicitSuites
        ? suiteOption
        : [...availableSuites.keys()];

    return requested.map((name) => name.toLowerCase());
}

/**
 * Ensure that every requested suite is defined in the available suite map.
 *
 * @param {Array<string>} suiteNames
 * @param {Map<string, unknown>} availableSuites
 * @param {import("commander").Command | undefined} command
 */
export function ensureSuitesAreKnown(suiteNames, availableSuites, command) {
    const unknownSuites = suiteNames.filter(
        (suite) => !availableSuites.has(suite)
    );

    if (unknownSuites.length === 0) {
        return;
    }

    const usage = resolveCommandUsage(command);

    throw new CliUsageError(
        `Unknown suite${unknownSuites.length === 1 ? "" : "s"}: ${unknownSuites.join(", ")}.`,
        { usage }
    );
}

/**
 * Execute a suite runner while normalizing thrown errors through the supplied
 * callback.
 */
async function executeSuiteRunner({
    runner,
    suiteName,
    runnerOptions,
    onError
}) {
    try {
        return await runner(runnerOptions);
    } catch (error) {
        if (typeof onError === "function") {
            return onError(error, { suiteName });
        }

        return { error: createCliErrorDetails(error) };
    }
}

/**
 * Execute the provided suite runners and collect their results.
 *
 * @param {{
 *     suiteNames: Array<string>,
 *     availableSuites: Map<string, unknown>,
 *     runnerOptions?: unknown,
 *     onError?: (error: unknown, context: { suiteName: string }) => unknown
 * }} parameters
 * @returns {Promise<Record<string, unknown>>}
 */
export async function collectSuiteResults({
    suiteNames,
    availableSuites,
    runnerOptions,
    onError
}) {
    if (!availableSuites || typeof availableSuites.get !== "function") {
        throw new TypeError(
            "availableSuites must provide a get function returning suite runners"
        );
    }

    if (!isNonEmptyArray(suiteNames)) {
        return {};
    }

    const results = {};

    for (const suiteName of suiteNames) {
        const runner = availableSuites.get(suiteName);
        if (typeof runner !== "function") {
            continue;
        }

        const suiteResult = await executeSuiteRunner({
            runner,
            suiteName,
            runnerOptions,
            onError
        });

        results[suiteName] = suiteResult;
    }

    return results;
}

export function createSuiteResultsPayload(results, { generatedAt } = {}) {
    return {
        generatedAt: generatedAt ?? new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            cwd: process.cwd()
        },
        suites: results
    };
}

/**
 * Emit suite results using the preferred output format.
 *
 * @param {Record<string, unknown>} results
 * @param {{ format?: string, pretty?: boolean }} options
 * @returns {boolean} `true` when JSON output was emitted.
 */
export function emitSuiteResults(
    results,
    { format, pretty } = {},
    extras = {}
) {
    const normalizedFormat = resolveSuiteOutputFormatOrThrow(format, {
        fallback: SuiteOutputFormat.JSON,
        errorConstructor: RangeError,
        createErrorMessage: (received) =>
            `Unsupported suite output format '${received}'. Valid formats: ${formatSuiteOutputFormatList()}.`
    });

    if (normalizedFormat === SuiteOutputFormat.HUMAN) {
        return false;
    }

    const payload =
        extras && typeof extras === "object" && extras.payload
            ? extras.payload
            : createSuiteResultsPayload(results);
    const spacing = pretty ? 2 : 0;
    const serialized = stringifyJsonForFile(payload, { space: spacing });
    process.stdout.write(serialized);
    return true;
}
