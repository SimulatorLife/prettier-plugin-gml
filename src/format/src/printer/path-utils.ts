import type { AstPath } from "prettier";

/**
 * Safely retrieves the parent node from a Prettier AST path.
 *
 * This function guards against cases where path.getParentNode might not exist
 * (e.g., in older Prettier versions, edge cases, or mock test objects).
 *
 * @param path - The Prettier AST path object
 * @param level - Optional: number of levels up to traverse (defaults to 0, i.e., immediate parent)
 * @returns The parent node, or null if not available
 *
 * @example
 * ```ts
 * const parent = safeGetParentNode(path);
 * if (parent && parent.type === "FunctionDeclaration") {
 *     // safe to access parent properties
 * }
 * ```
 */
export function safeGetParentNode(path: AstPath<any>, level: number = 0): any {
    // Check if getParentNode exists and is a function
    if (typeof path.getParentNode === "function") {
        return path.getParentNode(level);
    }

    // Fallback: use path.parent for level 0, otherwise return null
    if (level === 0 && "parent" in path) {
        return path.parent ?? null;
    }

    return null;
}

/**
 * Walks up the Prettier AST path and returns the first ancestor node for
 * which the given predicate returns `true`.
 *
 * This helper eliminates repeated ancestor-traversal boilerplate shared by
 * functions that search for a specific enclosing node kind (e.g.,
 * the nearest enclosing function declaration or constructor).
 *
 * @param path - The Prettier AST path object.
 * @param predicate - A function that returns `true` when the desired ancestor is found.
 * @returns The first matching ancestor node, or `null` if none is found.
 *
 * @example
 * ```ts
 * const enclosingFn = findAncestorNode(path, (node) => node.type === "FunctionDeclaration");
 * ```
 */
export function findAncestorNode(path: AstPath<any>, predicate: (node: any) => boolean): any {
    if (!path || typeof path.getParentNode !== "function") {
        return null;
    }

    for (let depth = 0; ; depth += 1) {
        const parent = safeGetParentNode(path, depth);
        if (!parent) {
            return null;
        }

        if (predicate(parent)) {
            return parent;
        }
    }
}

/**
 * Finds the nearest enclosing `FunctionDeclaration` ancestor node using the
 * Prettier path. This is a layout-only traversal helper for printer context
 * lookups and must not be used for semantic/content rewrites.
 *
 * Previously lived in `function-parameter-naming.ts` alongside doc-fragment
 * joining helpers; moved here because path traversal utilities belong in a
 * single dedicated module (`path-utils.ts`) rather than scattered across
 * printer sub-modules named for unrelated concerns.
 *
 * @param path - The Prettier AstPath to traverse upward
 * @returns The nearest enclosing `FunctionDeclaration` node, or `undefined`
 */
export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}
