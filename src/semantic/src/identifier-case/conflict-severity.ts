/**
 * Typed enumeration for identifier case conflict severity levels.
 *
 * This module centralizes severity values used throughout the identifier case
 * conflict reporting process, replacing raw string literals with typed constants.
 * This provides compile-time safety, IDE autocomplete, and validation helpers.
 */

import { Core } from "@gml-modules/core";

const { createEnumeratedOptionHelpers } = Core;

/**
 * Conflict severity levels for identifier case issues.
 */
export const ConflictSeverity = Object.freeze({
    ERROR: "error",
    WARNING: "warning",
    INFO: "info"
} as const);

export type ConflictSeverity = (typeof ConflictSeverity)[keyof typeof ConflictSeverity];

/**
 * Helpers for validating and normalizing conflict severity values.
 */
const conflictSeverityHelpers = createEnumeratedOptionHelpers(Object.values(ConflictSeverity), {
    formatError: (list, received) => `Conflict severity must be one of: ${list}. Received: ${received}.`,
    enforceStringType: true,
    valueLabel: "Conflict severity"
});

/**
 * Validate and normalize a conflict severity value.
 *
 * @param value - Raw severity value to validate
 * @param options - Optional configuration
 * @param options.errorConstructor - Optional custom error constructor
 * @returns Validated conflict severity
 * @throws Error when value is not a recognized conflict severity
 */
export function normalizeConflictSeverity(
    value: unknown,
    { errorConstructor }: { errorConstructor?: new (message: string) => Error } = {}
): ConflictSeverity {
    return conflictSeverityHelpers.requireValue(value, errorConstructor) as ConflictSeverity;
}

/**
 * Normalize a conflict severity value with a fallback.
 *
 * @param value - Raw severity value to normalize
 * @param fallback - Fallback severity to use if value is invalid (defaults to ERROR)
 * @returns Normalized conflict severity
 */
export function normalizeConflictSeverityWithFallback(
    value: unknown,
    fallback: ConflictSeverity = ConflictSeverity.ERROR
): ConflictSeverity {
    const normalized = conflictSeverityHelpers.normalize(value, null);
    return (normalized as ConflictSeverity) ?? fallback;
}

/**
 * Check if a value is a valid conflict severity.
 *
 * @param value - Value to check
 * @returns True if value is a valid conflict severity
 */
export function isConflictSeverity(value: unknown): value is ConflictSeverity {
    return conflictSeverityHelpers.valueSet.has(value as string);
}

/**
 * Get the ordered list of valid conflict severity values.
 *
 * @returns Readonly array of valid severity values
 */
export function getConflictSeverityValues(): readonly ConflictSeverity[] {
    return Object.values(ConflictSeverity);
}

/**
 * Get a formatted list of valid conflict severity values for error messages.
 *
 * @returns Formatted string listing valid severity values
 */
export function formatConflictSeverityList(): string {
    return conflictSeverityHelpers.formatList();
}
