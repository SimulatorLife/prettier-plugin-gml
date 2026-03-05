/**
 * Printer utilities for function-parameter layout in the GML formatter.
 *
 * This module is responsible for formatter-owned layout operations:
 *
 * - Joining an array of declarator doc fragments with ", " separators.
 *
 * All semantic/content rewrites (parameter renaming from `@function` tags,
 * filtering redundant `argument0`-style alias declarations, determining
 * parameter optionality from doc comments) belong in `@gml-modules/lint`,
 * not in the formatter. See target-state.md §2.2 and §3.2.
 *
 * Exported symbols are consumed by the printer (`print.ts`). All other symbols
 * in this file are module-private helpers.
 */

/**
 * Joins an array of declarator doc fragments with comma separators.
 *
 * Inserts ", " between each pair of elements to produce a comma-separated list
 * suitable for variable declarations.
 *
 * @param parts - Array of doc fragments to join
 * @returns Flat array with commas inserted between parts
 */
export function joinDeclaratorPartsWithCommas(parts: unknown[]): unknown[] {
    const joined: unknown[] = [];
    const count = parts.length;

    for (let i = 0; i < count; i += 1) {
        joined.push(parts[i]);

        if (i < count - 1) {
            joined.push(", ");
        }
    }

    return joined;
}
