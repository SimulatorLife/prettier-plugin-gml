/**
 * Validation module for refactoring operations.
 * Handles conflict detection, circular rename detection, and batch rename validation.
 */

import type { ConflictEntry, KeywordProvider, RenameRequest, SymbolOccurrence, SymbolResolver } from "./types.js";
import { assertValidIdentifierName, DEFAULT_RESERVED_KEYWORDS } from "./validation-utils.js";

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
        const errorMessage = error instanceof Error ? error.message : String(error);
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
            const existing = await resolver.lookup(normalizedNewName, occurrence.scopeId);
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

    if (keywordProvider && typeof keywordProvider.getReservedKeywords === "function") {
        const semanticReserved = (await keywordProvider.getReservedKeywords()) ?? [];
        reservedKeywords = new Set([...reservedKeywords, ...semanticReserved.map((keyword) => keyword.toLowerCase())]);
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
export function detectCircularRenames(renames: Array<RenameRequest>): Array<string> {
    // Build rename graph: source ID → target ID
    const graph = new Map<string, string>();
    for (const rename of renames) {
        const pathParts = rename.symbolId.split("/");
        pathParts[pathParts.length - 1] = rename.newName;
        graph.set(rename.symbolId, pathParts.join("/"));
    }

    // For each source node, follow the chain until we hit a cycle or dead end
    const visited = new Set<string>();

    for (const start of graph.keys()) {
        if (visited.has(start)) continue;

        const path: Array<string> = [];
        const pathSet = new Set<string>();
        let current = start;

        // Walk the chain from this starting node
        while (graph.has(current)) {
            if (pathSet.has(current)) {
                // Found a cycle - extract it
                const cycleStart = path.indexOf(current);
                return [...path.slice(cycleStart), current];
            }

            path.push(current);
            pathSet.add(current);
            visited.add(current);
            // Safe to assert non-null: graph.has(current) guarantees the key exists
            current = graph.get(current);
        }
    }

    return [];
}
