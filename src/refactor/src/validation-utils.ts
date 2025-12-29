/**
 * Validation utilities for refactoring operations.
 * This module provides identifier validation and reserved keyword checking.
 */

const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
    if (typeof name !== "string") {
        throw new TypeError(
            `Identifier names must be strings. Received ${typeof name}.`
        );
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        throw new Error(
            "Identifier names must not be empty or whitespace-only"
        );
    }

    if (trimmed !== name) {
        throw new Error(
            "Identifier names must not include leading or trailing whitespace"
        );
    }

    if (!IDENTIFIER_NAME_PATTERN.test(name)) {
        throw new Error(
            `Identifier '${name}' is not a valid GML identifier (expected [A-Za-z_][A-Za-z0-9_]*)`
        );
    }

    return name;
}

/**
 * Get the default set of GML reserved keywords.
 * These are keywords that cannot be used as identifiers.
 *
 * @returns Set of lowercase reserved keywords
 */
export function getDefaultReservedKeywords(): Set<string> {
    return new Set(
        [
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
        ].map((keyword) => keyword.toLowerCase())
    );
}
