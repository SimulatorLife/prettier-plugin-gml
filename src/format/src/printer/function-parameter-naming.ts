/**
 * Utilities for filtering and formatting function parameter declarators.
 *
 * This module contains only formatter-owned, layout-adjacent helpers for
 * handling function parameter declarators in the GML printer:
 *
 * - Removing misattached function doc-comment nodes that the parser
 *   incorrectly attaches to a variable declarator.
 * - Locating the nearest enclosing FunctionDeclaration in a Prettier AST path.
 * - Joining declarator doc fragments with comma separators.
 *
 * All semantic parameter-renaming logic (argument-alias inference, preferred
 * parameter name resolution from doc-comment metadata) belongs to
 * `@gml-modules/lint` and must not be re-introduced here.
 * See `docs/target-state.md §2.1` for the formatter/linter boundary contract.
 */

import type { AstPath } from "prettier";

import { findAncestorNode } from "./path-utils.js";

// ---------------------------------------------------------------------------
// Path traversal helpers
// ---------------------------------------------------------------------------

export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}

// ---------------------------------------------------------------------------
// Doc-comment attachment helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Declarator formatting utilities
// ---------------------------------------------------------------------------

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
