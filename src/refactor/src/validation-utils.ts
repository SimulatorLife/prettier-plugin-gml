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
