/**
 * String manipulation utilities for the GML to JavaScript transpiler.
 * These functions handle identifier validation, template string escaping,
 * and struct key normalization.
 */

/**
 * Check if a string is a valid JavaScript identifier.
 * Matches the ECMAScript identifier naming rules (IdentifierName production).
 *
 * @param value - The string to test
 * @returns true if the string is a valid identifier
 *
 * @example
 * isIdentifierLike("foo")      // true
 * isIdentifierLike("_bar")     // true
 * isIdentifierLike("$baz")     // true
 * isIdentifierLike("my-var")   // false
 * isIdentifierLike("123abc")   // false
 * isIdentifierLike("")         // false
 */
export function isIdentifierLike(value: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

/**
 * Escape special characters in template string text content.
 * Escapes backticks and template interpolation syntax to prevent
 * unintended substitution in JavaScript template literals.
 *
 * @param text - The raw text content to escape
 * @returns The escaped text safe for embedding in a template literal
 *
 * @example
 * escapeTemplateText("hello")           // "hello"
 * escapeTemplateText("hello `world`")   // "hello \\`world\\`"
 * escapeTemplateText("cost: ${price}")  // "cost: \\${price}"
 */
export function escapeTemplateText(text: string): string {
    return text.replaceAll("`", "\\`").replaceAll("${", "\\${");
}

/**
 * Convert a GML struct key to its JavaScript object property representation.
 * Keys that are valid identifiers or numeric strings are emitted as-is.
 * Other keys are quoted using JSON.stringify.
 *
 * @param rawKey - The raw key string from the GML struct
 * @returns The JavaScript property key (quoted or unquoted)
 *
 * @example
 * stringifyStructKey("name")        // "name"
 * stringifyStructKey("123")         // "123"
 * stringifyStructKey("my-key")      // '"my-key"'
 * stringifyStructKey('"quoted"')    // "quoted"
 * stringifyStructKey("'single'")    // "single"
 */
export function stringifyStructKey(rawKey: string): string {
    const key = normalizeStructKeyText(rawKey);
    if (isIdentifierLike(key) || /^[0-9]+$/.test(key)) {
        return key;
    }
    return JSON.stringify(key);
}

/**
 * Normalize quoted string literals by removing surrounding quotes.
 * Handles both double and single quotes. Returns the input unchanged
 * if it's not a properly quoted string.
 *
 * @param value - The string to normalize
 * @returns The unquoted string content, or the original if not quoted
 *
 * @example
 * normalizeStructKeyText('"hello"')     // "hello"
 * normalizeStructKeyText("'world'")     // "world"
 * normalizeStructKeyText('unquoted')    // "unquoted"
 * normalizeStructKeyText('"mixed\'')    // '"mixed\''
 * normalizeStructKeyText('""')          // ""
 */
export function normalizeStructKeyText(value: string): string {
    const startsWithQuote = value.startsWith('"') || value.startsWith("'");
    const endsWithQuote = value.endsWith('"') || value.endsWith("'");
    if (!startsWithQuote || !endsWithQuote || value.length < 2) {
        return value;
    }
    const usesSameQuote =
        (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (!usesSameQuote) {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value.slice(1, -1);
    }
}
