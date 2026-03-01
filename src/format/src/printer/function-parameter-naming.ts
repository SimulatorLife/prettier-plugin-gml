/**
 * Layout-utility helpers consumed by the GML printer (`print.ts`).
 *
 * Responsibility: layout and printing only.
 *
 * - Filtering misattached function doc-comments from variable declarators
 *   (prevents parser-misattached `@function` comments from appearing on
 *   unrelated variable declarations in formatted output).
 * - Joining declarator doc fragments with comma separators.
 * - Resolving the nearest enclosing `FunctionDeclaration` ancestor.
 *
 * All semantic/content rewrites (e.g., resolving preferred parameter names
 * from doc-comment metadata, filtering redundant argument-alias declarators)
 * are **not** performed here.  Those operations belong in `@gml-modules/lint`
 * (target-state.md §3.2).
 */

import type { AstPath } from "prettier";

import { findAncestorNode } from "./path-utils.js";

// ---------------------------------------------------------------------------
// Path traversal helpers
// ---------------------------------------------------------------------------

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
