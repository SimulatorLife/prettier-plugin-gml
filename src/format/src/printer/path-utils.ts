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
