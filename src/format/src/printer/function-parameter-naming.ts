/**
 * Printer-side helpers for function-parameter formatting.
 *
 * This module contains only the layout-facing utilities that the printer
 * (`print.ts`) directly calls:
 *
 * - `findEnclosingFunctionDeclaration` — path traversal to locate the
 *   nearest enclosing `FunctionDeclaration` node.
 * - `filterMisattachedFunctionDocComments` — suppresses parser-misattached
 *   `@function`/`@func` comments on non-function variable declarators so they
 *   do not appear in formatted output.
 * - `joinDeclaratorPartsWithCommas` — comma-joins declarator doc-fragments for
 *   multi-declarator variable statements.
 *
 * Semantic content rewrites — parameter renaming based on `@function` tag
 * metadata, redundant-alias declarator filtering, and argument-alias
 * initializer resolution — are owned by `@gml-modules/lint` per the
 * formatter/linter boundary defined in `docs/target-state.md` §2.2 and §3.2.
 * Those functions were previously exported from this file but have been
 * removed; the lint workspace is the correct home for such rewrites.
 */

import type { AstPath } from "prettier";

import { findAncestorNode } from "./path-utils.js";

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

/**
 * Walks the path ancestry to find the nearest enclosing `FunctionDeclaration` node.
 *
 * @param path - The current Prettier AST path
 * @returns The nearest `FunctionDeclaration` ancestor, or `undefined` if none exists
 */
export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}
