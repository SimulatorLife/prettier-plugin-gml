/**
 * Typed enumerations for test case and parse result statuses.
 *
 * This module centralizes status values used throughout the quality report
 * generation process, replacing raw string literals with typed constants.
 * This provides compile-time safety, IDE autocomplete, and validation helpers.
 */

import { createEnumeratedOptionHelpers } from "../../shared/enumerated-option-helpers.js";

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

/**
 * Helpers for validating and normalizing test case status values.
 */
const testCaseStatusHelpers = createEnumeratedOptionHelpers(Object.values(TestCaseStatus), {
    formatError: (list, received) => `Test case status must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Test case status"
});

/**
 * Helpers for validating and normalizing parse result status values.
 */
const parseResultStatusHelpers = createEnumeratedOptionHelpers(Object.values(ParseResultStatus), {
    formatError: (list, received) => `Parse result status must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Parse result status"
});

/**
 * Helpers for validating and normalizing scan status values.
 */
const scanStatusHelpers = createEnumeratedOptionHelpers(Object.values(ScanStatus), {
    formatError: (list, received) => `Scan status must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Scan status"
});

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
    return testCaseStatusHelpers.requireValue(value, errorConstructor) as TestCaseStatus;
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
    return parseResultStatusHelpers.requireValue(value, errorConstructor) as ParseResultStatus;
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
    return scanStatusHelpers.requireValue(value, errorConstructor) as ScanStatus;
}

/**
 * Check if a value is a valid test case status.
 *
 * @param value - Value to check
 * @returns True if value is a valid test case status
 */
export function isTestCaseStatus(value: unknown): value is TestCaseStatus {
    return testCaseStatusHelpers.valueSet.has(value as string);
}

/**
 * Check if a value is a valid parse result status.
 *
 * @param value - Value to check
 * @returns True if value is a valid parse result status
 */
export function isParseResultStatus(value: unknown): value is ParseResultStatus {
    return parseResultStatusHelpers.valueSet.has(value as string);
}

/**
 * Check if a value is a valid scan status.
 *
 * @param value - Value to check
 * @returns True if value is a valid scan status
 */
export function isScanStatus(value: unknown): value is ScanStatus {
    return scanStatusHelpers.valueSet.has(value as string);
}
