/**
 * Printer utilities for function-parameter layout in the GML formatter.
 *
 * This module is responsible for three formatter-owned operations:
 *
 * - Filtering misattached function doc-comments from variable declarators
 *   (workaround for a parser comment-attachment bug).
 * - Finding the nearest enclosing `FunctionDeclaration` ancestor via path
 *   traversal (layout-only structural query).
 * - Joining an array of declarator doc fragments with ", " separators.
 *
 * All semantic/content rewrites (parameter renaming from `@function` tags,
 * filtering redundant `argument0`-style alias declarations) belong in
 * `@gml-modules/lint`, not in the formatter. See target-state.md §2.2 and §3.2.
 *
 * Exported symbols are consumed by the printer (`print.ts`). All other symbols
 * in this file are module-private helpers.
 */

import type { AstPath } from "prettier";

import { findAncestorNode } from "./path-utils.js";

// ---------------------------------------------------------------------------
// Path traversal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the nearest enclosing `FunctionDeclaration` ancestor node using the
 * Prettier path. Used by the printer to determine doc-param optionality for
 * `= undefined` default parameters.
 *
 * @param path - The Prettier AstPath to traverse upward
 * @returns The nearest enclosing `FunctionDeclaration` node, or `undefined`
 */
export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}

/**
 * Filters out misattached function doc-comments from a declarator's comments array.
 *
 * Mutates the declarator in place by filtering its comments array and marking
 * filtered comments as printed. If all comments are filtered, deletes the comments property.
 *
 * This workaround addresses a parser issue where JSDoc function comments (@function, @func)
 * are incorrectly attached to variable declarators instead of their intended function targets.
 *
 * @param declarator - The variable declarator node to process
 */
export function filterMisattachedFunctionDocComments(declarator: unknown): void {
    const d = declarator as { comments?: Array<{ value: string; printed?: boolean }> };
    if (!d.comments) {
        return;
    }

    d.comments = d.comments.filter((comment) => {
        const isFunctionComment = comment.value.includes("@function") || comment.value.includes("@func");

        if (isFunctionComment) {
            comment.printed = true;
            return false;
        }

        return true;
    });

    if (d.comments.length === 0) {
        delete d.comments;
    }
}

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
