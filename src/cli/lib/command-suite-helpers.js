import process from "node:process";

import { CliUsageError } from "./cli-errors.js";
import { normalizeEnumeratedOption } from "./shared-deps.js";

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
    {
        fallback,
        errorConstructor = Error,
        createErrorMessage = () =>
            `Format must be one of: ${formatSuiteOutputFormatList()}.`
    } = {}
) {
    const normalized = normalizeSuiteOutputFormat(value, { fallback });

    if (normalized) {
        return normalized;
    }

    const errorMessage =
        typeof createErrorMessage === "function"
            ? createErrorMessage(value)
            : createErrorMessage;

    const message =
        typeof errorMessage === "string"
            ? errorMessage
            : String(errorMessage ?? "");

    const ErrorConstructor =
        typeof errorConstructor === "function" ? errorConstructor : Error;

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
    const suiteOption = Array.isArray(options?.suite) ? options.suite : [];
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

    const usage =
        typeof command?.helpInformation === "function"
            ? command.helpInformation()
            : undefined;

    throw new CliUsageError(
        `Unknown suite${unknownSuites.length === 1 ? "" : "s"}: ${unknownSuites.join(", ")}.`,
        { usage }
    );
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

    if (!Array.isArray(suiteNames) || suiteNames.length === 0) {
        return {};
    }

    const results = {};

    for (const suiteName of suiteNames) {
        const runner = availableSuites.get(suiteName);
        if (typeof runner !== "function") {
            continue;
        }

        try {
            results[suiteName] = await runner(runnerOptions);
        } catch (error) {
            results[suiteName] =
                typeof onError === "function"
                    ? onError(error, { suiteName })
                    : { error };
        }
    }

    return results;
}

/**
 * Emit suite results using the preferred output format.
 *
 * @param {Record<string, unknown>} results
 * @param {{ format?: string, pretty?: boolean }} options
 * @returns {boolean} `true` when JSON output was emitted.
 */
export function emitSuiteResults(results, { format, pretty } = {}) {
    const normalizedFormat = resolveSuiteOutputFormatOrThrow(format, {
        fallback: SuiteOutputFormat.JSON,
        errorConstructor: RangeError,
        createErrorMessage: (received) =>
            `Unsupported suite output format '${received}'. Valid formats: ${formatSuiteOutputFormatList()}.`
    });

    if (normalizedFormat === SuiteOutputFormat.HUMAN) {
        return false;
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        suites: results
    };
    const spacing = pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(payload, null, spacing)}\n`);
    return true;
}
