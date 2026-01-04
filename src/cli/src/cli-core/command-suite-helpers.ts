import process from "node:process";

import { CliUsageError, createCliErrorDetails } from "./errors.js";
// Pull shared helpers from the barrel so new call sites avoid the legacy
// `array-utils` shim slated for removal.
import { Core } from "@gml-modules/core";
import { createEnumeratedOptionHelpers } from "../shared/enumerated-option-helpers.js";
import { resolveCommandUsage } from "./command-usage.js";
import type { CommanderCommandLike } from "./commander-types.js";

const { isNonEmptyArray, toMutableArray, stringifyJsonForFile } = Core;

export const SuiteOutputFormat = Object.freeze({
    JSON: "json",
    HUMAN: "human"
} as const);

export type SuiteOutputFormat = (typeof SuiteOutputFormat)[keyof typeof SuiteOutputFormat];

export type SuiteRunner = (options?: unknown) => unknown;

export interface SuitePayloadExtras {
    payload?: Record<string, unknown>;
}

export interface EmitSuiteResultsOptions {
    format?: string;
    pretty?: boolean;
}

export interface SuiteResultsPayloadOptions {
    generatedAt?: string;
}

const suiteOutputFormatHelpers = createEnumeratedOptionHelpers(Object.values(SuiteOutputFormat), {
    formatError: (list) => `Format must be one of: ${list}.`,
    enforceStringType: true,
    valueLabel: "Suite output format"
});

const defaultSuiteErrorHandler = (error: unknown) => ({
    error: createCliErrorDetails(error)
});

export function formatSuiteOutputFormatList() {
    return suiteOutputFormatHelpers.formatList();
}

export function normalizeSuiteOutputFormat(
    value: unknown,
    { fallback }: { fallback?: SuiteOutputFormat | null } = {}
): SuiteOutputFormat | null {
    return suiteOutputFormatHelpers.normalize(value, fallback) as SuiteOutputFormat | null;
}

export function resolveSuiteOutputFormatOrThrow(
    value: unknown,
    {
        errorConstructor
    }: {
        errorConstructor?: new (message: string) => Error;
    } = {}
): SuiteOutputFormat {
    return suiteOutputFormatHelpers.requireValue(value, errorConstructor) as SuiteOutputFormat;
}

/**
 * Normalize the requested suite names for execution.
 *
 * @param {{ suite: Array<string> }} options
 * @param {Map<string, unknown>} availableSuites
 * @returns {Array<string>}
 */
export function resolveRequestedSuites(
    options: { suite?: Array<string> | string } | null | undefined,
    availableSuites: Map<string, SuiteRunner>
): Array<string> {
    const suiteInput = options?.suite;
    const suiteCollection = typeof suiteInput === "string" ? [suiteInput] : (suiteInput ?? []);
    const suiteOption = toMutableArray(suiteCollection);
    const hasExplicitSuites = suiteOption.length > 0;
    const requested = hasExplicitSuites ? suiteOption : [...availableSuites.keys()];

    return requested.map((name) => name.toLowerCase());
}

/**
 * Ensure that every requested suite is defined in the available suite map.
 *
 * @param {Array<string>} suiteNames
 * @param {Map<string, unknown>} availableSuites
 * @param {import("commander").Command | undefined} command
 */
export function ensureSuitesAreKnown(
    suiteNames: Array<string>,
    availableSuites: Map<string, SuiteRunner>,
    command: CommanderCommandLike | undefined
): void {
    const unknownSuites = suiteNames.filter((suite) => !availableSuites.has(suite));

    if (unknownSuites.length === 0) {
        return;
    }

    const usage = resolveCommandUsage(command);

    throw new CliUsageError(`Unknown suite${unknownSuites.length === 1 ? "" : "s"}: ${unknownSuites.join(", ")}.`, {
        usage
    });
}

function assertSuiteRunnerLookup(availableSuites: Map<string, SuiteRunner>): void {
    if (!availableSuites || typeof availableSuites.get !== "function") {
        throw new TypeError("availableSuites must provide a get function returning suite runners");
    }
}

/**
 * Execute an individual suite runner and normalize the resulting entry.
 *
 * Offloading this bookkeeping keeps {@link collectSuiteResults} focused on
 * sequencing suites at a single abstraction layer instead of juggling raw
 * result mutations and error handling inline.
 *
 * @param {{
 *   suiteName: string,
 *   availableSuites: Map<string, unknown>,
 *   runnerOptions: unknown,
 *   handleSuiteError: (error: unknown, context: { suiteName: string }) => unknown
 * }} context
 * @returns {Promise<[string, unknown] | null>}
 */
async function executeSuiteRunner({
    suiteName,
    availableSuites,
    runnerOptions,
    handleSuiteError
}: {
    suiteName: string;
    availableSuites: Map<string, SuiteRunner>;
    runnerOptions: unknown;
    handleSuiteError: (error: unknown, context: { suiteName: string }) => unknown;
}): Promise<[string, unknown] | null> {
    const runner = availableSuites.get(suiteName);
    if (typeof runner !== "function") {
        return null;
    }

    try {
        const result = await runner(runnerOptions);
        return [suiteName, result];
    } catch (error) {
        const fallback = handleSuiteError(error, { suiteName });
        return [suiteName, fallback];
    }
}

/**
 * Execute the provided suite runners and collect their results, applying an
 * optional error mapper when a runner throws.
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
}: {
    suiteNames: Array<string>;
    availableSuites: Map<string, SuiteRunner>;
    runnerOptions?: unknown;
    onError?: (error: unknown, context: { suiteName: string }) => unknown;
}): Promise<Record<string, unknown>> {
    assertSuiteRunnerLookup(availableSuites);

    if (!isNonEmptyArray(suiteNames)) {
        return {};
    }

    const handleSuiteError = typeof onError === "function" ? onError : defaultSuiteErrorHandler;

    const executionResults = await Promise.all(
        suiteNames.map((suiteName) =>
            executeSuiteRunner({
                suiteName,
                availableSuites,
                runnerOptions,
                handleSuiteError
            })
        )
    );

    const entries = executionResults.filter((result): result is [string, unknown] => result !== null);

    return Object.fromEntries(entries);
}

export function createSuiteResultsPayload(
    results: Record<string, unknown>,
    { generatedAt }: SuiteResultsPayloadOptions = {}
) {
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
    results: Record<string, unknown>,
    { format, pretty }: EmitSuiteResultsOptions = {},
    extras: SuitePayloadExtras = {}
): boolean {
    const normalizedFormat = resolveSuiteOutputFormatOrThrow(format, {
        errorConstructor: RangeError
    });

    if (normalizedFormat === SuiteOutputFormat.HUMAN) {
        return false;
    }

    const payload =
        extras && typeof extras === "object" && extras.payload ? extras.payload : createSuiteResultsPayload(results);
    const spacing = pretty ? 2 : 0;
    const serialized = stringifyJsonForFile(payload, { space: spacing });
    process.stdout.write(serialized);
    return true;
}
