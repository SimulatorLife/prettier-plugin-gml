/**
 * Layout-only utilities consumed by the printer (`print.ts`).
 *
 * This module owns three narrowly-scoped helpers:
 * - {@link filterMisattachedFunctionDocComments} — removes parser-misattached
 *   `@function`/`@func` comments from variable declarators (workaround for a
 *   comment-attachment bug in the parser; see comment in print.ts).
 * - {@link findEnclosingFunctionDeclaration} — walks the AST path upward to
 *   find the nearest enclosing `FunctionDeclaration` node.
 * - {@link joinDeclaratorPartsWithCommas} — joins an array of Prettier Doc
 *   fragments with ", " separators.
 *
 * Semantic/content rewrites such as renaming `argumentN` parameters or
 * filtering redundant alias declarations belong in `@gml-modules/lint`.
 * See docs/target-state.md §2.2 and §3.2.
 */

import type { AstPath } from "prettier";

import { findAncestorNode } from "./path-utils.js";

// ---------------------------------------------------------------------------
// Path traversal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the nearest enclosing `FunctionDeclaration` node by walking the AST path upward.
 *
 * Used by the printer to determine optionality of trailing `= undefined` defaults.
 *
 * @param path - Prettier AST path
 * @returns The enclosing `FunctionDeclaration` node, or `undefined` if not found.
 */
export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}

// ---------------------------------------------------------------------------
// Comment-filter helper (parser-bug workaround)
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
// Declarator joining helper
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
