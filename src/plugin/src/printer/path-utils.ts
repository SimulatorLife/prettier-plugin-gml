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
