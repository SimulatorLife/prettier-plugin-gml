/**
 * Centralized constants for GML lint rules.
 *
 * Mirrors the subset of plugin constants that the lint transforms also need, so
 * both workspaces share the same threshold values without either importing from
 * the other.
 */

/**
 * Minimum consecutive variable declarations before a blank line is enforced
 * before the following statement (e.g. a `for` loop).
 */
export const DEFAULT_VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS = 4;
