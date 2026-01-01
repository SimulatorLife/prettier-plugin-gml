/**
 * Validation module for refactoring operations.
 * Handles conflict detection, circular rename detection, and batch rename validation.
 */

import type {
    ConflictEntry,
    KeywordProvider,
    RenameRequest,
    SymbolOccurrence,
    SymbolResolver
} from "./types.js";
import {
    assertValidIdentifierName,
    DEFAULT_RESERVED_KEYWORDS
} from "./validation-utils.js";

/**
 * Detect conflicts that would arise from renaming a symbol.
 * Checks for reserved keywords and shadowing conflicts.
 *
 * @param oldName - Original symbol name
 * @param newName - Proposed new name
 * @param occurrences - All occurrences of the symbol
 * @param resolver - Symbol resolver for scope-aware checks (null if not available)
 * @param keywordProvider - Keyword provider for reserved keyword checks (null if not available)
 * @returns Array of detected conflicts
 */
export async function detectRenameConflicts(
    oldName: string,
    newName: string,
    occurrences: Array<SymbolOccurrence>,
    resolver: Partial<SymbolResolver> | null,
    keywordProvider: Partial<KeywordProvider> | null
): Promise<Array<ConflictEntry>> {
    const conflicts: Array<ConflictEntry> = [];
    let normalizedNewName: string;

    try {
        normalizedNewName = assertValidIdentifierName(newName);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        conflicts.push({
            type: "invalid_identifier",
            message: errorMessage
        });
        return conflicts;
    }

    // Test whether renaming would introduce shadowing conflicts where the new
    // name collides with an existing symbol in the same scope. For example,
    // renaming a local variable `x` to `y` when `y` is already defined in that
    // scope would hide the original `y`, breaking references to it.
    if (resolver && typeof resolver.lookup === "function") {
        for (const occurrence of occurrences) {
            // Perform a scope-aware lookup for the new name at each occurrence
            // site. If we find an existing binding that isn't the symbol we're
            // renaming, record a conflict so the user can resolve it manually.
            const existing = await resolver.lookup(
                normalizedNewName,
                occurrence.scopeId
            );
            if (existing && existing.name !== oldName) {
                conflicts.push({
                    type: "shadow",
                    message: `Renaming '${oldName}' to '${normalizedNewName}' would shadow existing symbol in scope`,
                    path: occurrence.path
                });
            }
        }
    }

    // Reject renames that would overwrite GML reserved keywords (like `if`,
    // `function`) or built-in identifiers (like `self`, `global`). Allowing
    // such renames would cause syntax errors or silently bind user symbols to
    // language constructs, breaking both the parser and runtime semantics.
    let reservedKeywords = DEFAULT_RESERVED_KEYWORDS;

    if (
        keywordProvider &&
        typeof keywordProvider.getReservedKeywords === "function"
    ) {
        const semanticReserved =
            (await keywordProvider.getReservedKeywords()) ?? [];
        reservedKeywords = new Set([
            ...reservedKeywords,
            ...semanticReserved.map((keyword) => keyword.toLowerCase())
        ]);
    }

    if (reservedKeywords.has(normalizedNewName.toLowerCase())) {
        conflicts.push({
            type: "reserved",
            message: `'${normalizedNewName}' is a reserved keyword and cannot be used as an identifier`
        });
    }

    return conflicts;
}

/**
 * Build a directed graph of rename operations for cycle detection.
 * Maps each source symbol ID to its target symbol ID after rename.
 *
 * @param renames - Array of rename operations
 * @returns Map from source symbol ID to target symbol ID
 */
export function buildRenameGraph(
    renames: Array<RenameRequest>
): Map<string, string> {
    const graph = new Map<string, string>();

    for (const rename of renames) {
        const sourceId = rename.symbolId;
        const pathParts = sourceId.split("/");
        pathParts[pathParts.length - 1] = rename.newName;
        const targetId = pathParts.join("/");
        graph.set(sourceId, targetId);
    }

    return graph;
}

/**
 * Detect circular rename chains in a batch of rename operations.
 * Returns the first detected cycle as an array of symbol IDs, or an empty array if no cycles exist.
 *
 * A circular chain occurs when renames form a cycle, such as:
 * - A→B, B→A (simple 2-cycle)
 * - A→B, B→C, C→A (3-cycle)
 *
 * These chains are problematic because after applying the first rename, subsequent
 * renames in the cycle reference symbols that no longer exist by their original names.
 *
 * @param renames - Rename operations to check
 * @returns First detected cycle as symbol IDs, or empty array if no cycles
 */
export function detectCircularRenames(
    renames: Array<RenameRequest>
): Array<string> {
    const graph = buildRenameGraph(renames);

    // Use depth-first search to detect cycles. We maintain a "visiting" set to
    // track nodes currently on the recursion stack, which allows us to identify
    // back edges that indicate cycles.
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: Array<string> = [];

    const dfs = (nodeId: string): Array<string> | null => {
        if (visiting.has(nodeId)) {
            // Found a back edge - extract the cycle from the current path.
            // We append nodeId to close the cycle for clearer visualization
            // in error messages (e.g., "A → B → C → A" instead of "A → B → C").
            const cycleStart = path.indexOf(nodeId);
            return [...path.slice(cycleStart), nodeId];
        }

        if (visited.has(nodeId)) {
            return null;
        }

        visiting.add(nodeId);
        path.push(nodeId);

        // Follow the rename edge to the next node (target of this rename).
        // We only recurse if the target is itself a source of another rename,
        // allowing us to detect chains like A→B→C where B is also being renamed.
        const nextId = graph.get(nodeId);
        if (nextId && graph.has(nextId)) {
            const cycle = dfs(nextId);
            if (cycle) {
                return cycle;
            }
        }

        path.pop();
        visiting.delete(nodeId);
        visited.add(nodeId);

        return null;
    };

    // Check each rename operation as a potential cycle starting point
    for (const sourceId of graph.keys()) {
        if (!visited.has(sourceId)) {
            const cycle = dfs(sourceId);
            if (cycle) {
                return cycle;
            }
        }
    }

    return [];
}
