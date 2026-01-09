/**
 * Validation utilities for refactoring operations.
 * This module provides identifier validation and reserved keyword checking.
 */

import { Core } from "@gml-modules/core";

/**
 * Validate and normalize an identifier name.
 * Throws TypeError or Error if the name is invalid.
 *
 * @param name - The identifier name to validate
 * @returns The validated name
 * @throws {TypeError} If name is not a string
 * @throws {Error} If name is empty, has whitespace, or contains invalid characters
 */
export function assertValidIdentifierName(name: unknown): string {
    const validated = Core.assertNonEmptyString(name, {
        name: "Identifier names",
        trim: false,
        errorMessage: "Identifier names must be strings and must not be empty or whitespace-only"
    });

    Core.assertNoLeadingOrTrailingWhitespace(validated, {
        name: "Identifier names",
        errorMessage: "Identifier names must not include leading or trailing whitespace"
    });

    if (!Core.GML_IDENTIFIER_NAME_PATTERN.test(validated)) {
        throw new Error(`Identifier '${validated}' is not a valid GML identifier (expected [A-Za-z_][A-Za-z0-9_]*)`);
    }

    return validated;
}

/**
 * Validates that a value is a non-empty string.
 * Used to validate rename operation parameters like oldName and newName.
 *
 * @param value - The value to validate
 * @param parameterName - The parameter name for error messages
 * @param functionName - The function name for error messages
 * @throws {TypeError} If value is not a non-empty string
 */
export function assertNonEmptyNameString(value: unknown, parameterName: string, functionName: string): void {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`${functionName} requires ${parameterName} as a non-empty string`);
    }
}

/**
 * Check if an object has a callable method with the given name.
 * This helper eliminates the repeated pattern of checking
 * `obj && typeof obj.method === "function"` throughout the refactor codebase.
 *
 * @param obj - The object to check (may be null or undefined)
 * @param methodName - The name of the method to check for
 * @returns true if obj is non-null and has a callable method with the given name
 *
 * @example
 * if (hasMethod(semantic, "getSymbolOccurrences")) {
 *     const occurrences = await semantic.getSymbolOccurrences(name);
 * }
 */
export function hasMethod<T>(
    obj: T | null | undefined,
    methodName: string
): obj is T & Record<string, (...args: never[]) => unknown> {
    return obj != null && typeof (obj as Record<string, unknown>)[methodName] === "function";
}

/**
 * Default set of GML reserved keywords.
 * These are keywords that cannot be used as identifiers.
 * Frozen to prevent accidental modification and ensure immutability.
 */
export const DEFAULT_RESERVED_KEYWORDS: ReadonlySet<string> = Object.freeze(
    new Set([
        "if",
        "else",
        "while",
        "for",
        "do",
        "switch",
        "case",
        "default",
        "break",
        "continue",
        "return",
        "function",
        "var",
        "globalvar",
        "enum",
        "with",
        "repeat",
        "until",
        "exit",
        "self",
        "other",
        "all",
        "noone",
        "global"
    ])
);
