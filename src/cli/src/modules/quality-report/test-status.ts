/**
 * Typed enumerations for test case and parse result statuses.
 *
 * This module centralizes status values used throughout the quality report
 * generation process, replacing raw string literals with typed constants.
 * This provides compile-time safety, IDE autocomplete, and validation helpers.
 */

import { Core } from "@gml-modules/core";

const { createEnumeratedOptionHelpers } = Core;

/**
 * Test case execution status.
 */
export const TestCaseStatus = Object.freeze({
    PASSED: "passed",
    FAILED: "failed",
    SKIPPED: "skipped"
} as const);

export type TestCaseStatus = (typeof TestCaseStatus)[keyof typeof TestCaseStatus];

/**
 * Parse result status for XML test files.
 */
export const ParseResultStatus = Object.freeze({
    OK: "ok",
    ERROR: "error",
    IGNORED: "ignored"
} as const);

export type ParseResultStatus = (typeof ParseResultStatus)[keyof typeof ParseResultStatus];

/**
 * Scan status for test directories.
 */
export const ScanStatus = Object.freeze({
    MISSING: "missing",
    EMPTY: "empty",
    FOUND: "found"
} as const);

export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

type StatusHelperSet<Status extends string> = {
    helpers: ReturnType<typeof createEnumeratedOptionHelpers>;
    requireStatus: (value: unknown, options?: { errorConstructor?: new (message: string) => Error }) => Status;
    isStatus: (value: unknown) => value is Status;
};

function createStatusHelperSet<Status extends string>(
    values: readonly Status[],
    label: string
): StatusHelperSet<Status> {
    const helpers = createEnumeratedOptionHelpers(values, {
        formatError: (list, received) => `${label} must be one of: ${list}. Received: ${received}.`,
        enforceStringType: true,
        valueLabel: label
    });

    return {
        helpers,
        requireStatus: (value, { errorConstructor } = {}) => helpers.requireValue(value, errorConstructor) as Status,
        isStatus: (value: unknown): value is Status => helpers.valueSet.has(value as string)
    };
}

const testCaseStatusHelpers = createStatusHelperSet(Object.values(TestCaseStatus), "Test case status");
const parseResultStatusHelpers = createStatusHelperSet(Object.values(ParseResultStatus), "Parse result status");
const scanStatusHelpers = createStatusHelperSet(Object.values(ScanStatus), "Scan status");

/**
 * Validate and normalize a test case status value.
 *
 * @param value - Raw status value to validate
 * @param errorConstructor - Optional custom error constructor
 * @returns Validated test case status
 * @throws Error when value is not a recognized test case status
 */
export function normalizeTestCaseStatus(
    value: unknown,
    { errorConstructor }: { errorConstructor?: new (message: string) => Error } = {}
): TestCaseStatus {
    return testCaseStatusHelpers.requireStatus(value, { errorConstructor });
}

/**
 * Validate and normalize a parse result status value.
 *
 * @param value - Raw status value to validate
 * @param errorConstructor - Optional custom error constructor
 * @returns Validated parse result status
 * @throws Error when value is not a recognized parse result status
 */
export function normalizeParseResultStatus(
    value: unknown,
    { errorConstructor }: { errorConstructor?: new (message: string) => Error } = {}
): ParseResultStatus {
    return parseResultStatusHelpers.requireStatus(value, { errorConstructor });
}

/**
 * Validate and normalize a scan status value.
 *
 * @param value - Raw status value to validate
 * @param errorConstructor - Optional custom error constructor
 * @returns Validated scan status
 * @throws Error when value is not a recognized scan status
 */
export function normalizeScanStatus(
    value: unknown,
    { errorConstructor }: { errorConstructor?: new (message: string) => Error } = {}
): ScanStatus {
    return scanStatusHelpers.requireStatus(value, { errorConstructor });
}

/**
 * Check if a value is a valid test case status.
 *
 * @param value - Value to check
 * @returns True if value is a valid test case status
 */
export function isTestCaseStatus(value: unknown): value is TestCaseStatus {
    return testCaseStatusHelpers.isStatus(value);
}

/**
 * Check if a value is a valid parse result status.
 *
 * @param value - Value to check
 * @returns True if value is a valid parse result status
 */
export function isParseResultStatus(value: unknown): value is ParseResultStatus {
    return parseResultStatusHelpers.isStatus(value);
}

/**
 * Check if a value is a valid scan status.
 *
 * @param value - Value to check
 * @returns True if value is a valid scan status
 */
export function isScanStatus(value: unknown): value is ScanStatus {
    return scanStatusHelpers.isStatus(value);
}
