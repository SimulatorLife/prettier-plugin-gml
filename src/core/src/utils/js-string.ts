/**
 * JavaScript string manipulation utilities for GML tooling.
 *
 * This module provides utilities for working with JavaScript identifiers,
 * template literals, and object keys when emitting or manipulating JavaScript
 * code generated from GML source.
 *
 * Key capabilities:
 * - Validating ECMAScript identifier syntax
 * - Escaping template string content
 * - Normalizing and quoting object property keys
 */

/**
 * Check if a string is a valid JavaScript identifier.
 * Matches the ECMAScript identifier naming rules (IdentifierName production).
 *
 * @param {string} value Candidate string to evaluate.
 * @returns {boolean} `true` when {@link value} matches the ECMAScript identifier pattern.
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
 * @param {string} text Raw text content to escape.
 * @returns {string} Escaped text safe for embedding in a JavaScript template literal.
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
 * @param {string} rawKey Raw key string from the GML struct.
 * @returns {string} JavaScript property key representation, quoted when necessary.
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
 * @param {string} value Quoted or unquoted string to normalize.
 * @returns {string} Unquoted string content, or the original value when not surrounded by matching quotes.
 *
 * @example
 * normalizeStructKeyText('"hello"')     // "hello"
 * normalizeStructKeyText("'world'")     // "world"
 * normalizeStructKeyText('unquoted')    // "unquoted"
 * normalizeStructKeyText('"mixed\'')    // '"mixed\''
 * normalizeStructKeyText('""')          // ""
 */
export function normalizeStructKeyText(value: string): string {
    if (value.length < 2) {
        return value;
    }

    const first = value[0];
    const last = value.at(-1);

    if ((first !== '"' && first !== "'") || first !== last) {
        return value;
    }

    // For double-quoted strings, use JSON.parse to handle escape sequences.
    // For single-quoted strings or when JSON.parse fails, strip the quotes.
    if (first === '"') {
        try {
            return JSON.parse(value) as string;
        } catch {
            // JSON.parse failed, meaning the double-quoted string contains invalid
            // escape sequences or malformed JSON syntax. Instead of crashing, fall
            // through to the quote-stripping fallback which naively removes the
            // surrounding quotes and returns the raw content. This graceful degradation
            // ensures the transpiler can still emit partial output for malformed strings
            // rather than halting on every syntax edge case, allowing developers to see
            // the broader transpilation result and fix string literals incrementally.
        }
    }

    // Strip surrounding quotes and return the raw content
    return value.slice(1, -1);
}
