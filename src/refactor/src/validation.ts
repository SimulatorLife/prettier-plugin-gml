/**
 * Validation module for refactoring operations.
 * Handles conflict detection, circular rename detection, and batch rename validation.
 */

import {
    ConflictType,
    type ConflictEntry,
    type KeywordProvider,
    type RenameRequest,
    type SymbolOccurrence,
    type SymbolResolver,
    type FileSymbolProvider
} from "./types.js";
import {
    assertValidIdentifierName,
    extractSymbolName,
    DEFAULT_RESERVED_KEYWORDS,
    hasMethod
} from "./validation-utils.js";
import { Core } from "@gml-modules/core";

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
        conflicts.push({
            type: ConflictType.INVALID_IDENTIFIER,
            message: Core.getErrorMessage(error)
        });
        return conflicts;
    }

    // Test whether renaming would introduce shadowing conflicts where the new
    // name collides with an existing symbol in the same scope. For example,
    // renaming a local variable `x` to `y` when `y` is already defined in that
    // scope would hide the original `y`, breaking references to it.
    if (hasMethod(resolver, "lookup")) {
        for (const occurrence of occurrences) {
            // Perform a scope-aware lookup for the new name at each occurrence
            // site. If we find an existing binding that isn't the symbol we're
            // renaming, record a conflict so the user can resolve it manually.
            // eslint-disable-next-line no-await-in-loop -- Scope lookup must be sequential for each occurrence
            const existing = await resolver.lookup(normalizedNewName, occurrence.scopeId);
            if (existing && existing.name !== oldName) {
                conflicts.push({
                    type: ConflictType.SHADOW,
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

    if (hasMethod(keywordProvider, "getReservedKeywords")) {
        const semanticReserved = (await keywordProvider.getReservedKeywords()) ?? [];
        reservedKeywords = new Set([...reservedKeywords, ...semanticReserved.map((keyword) => keyword.toLowerCase())]);
    }

    if (reservedKeywords.has(normalizedNewName.toLowerCase())) {
        conflicts.push({
            type: ConflictType.RESERVED,
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
            // Safe to assert: graph.has(current) guarantees the value exists
            current = graph.get(current);
        }
    }

    return [];
}

/**
 * Validate rename request structure and basic semantic constraints before planning.
 * This is a pre-flight check that fails fast on invalid requests, avoiding expensive
 * occurrence gathering and conflict detection when the rename is structurally unsound.
 *
 * Unlike full rename validation, this does not gather occurrences or check for
 * shadowing conflicts. It only validates that:
 * - The request has required fields
 * - The identifier names are syntactically valid
 * - The symbol exists in the semantic index (if available)
 * - The new name differs from the old name
 *
 * @param symbolId - Symbol identifier to rename
 * @param newName - Proposed new name
 * @param resolver - Symbol resolver for existence checks (null if not available)
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * const errors = await validateRenameStructure(
 *   "gml/script/scr_player",
 *   "scr_hero",
 *   semantic
 * );
 * if (errors.length > 0) {
 *   console.error("Invalid rename:", errors);
 *   return;
 * }
 * // Proceed with full rename planning
 */
export async function validateRenameStructure(
    symbolId: string | undefined | null,
    newName: string | undefined | null,
    resolver: Partial<SymbolResolver> | null
): Promise<Array<string>> {
    try {
        Core.assertNonEmptyString(symbolId, {
            name: "symbolId",
            trim: true
        });
    } catch (error) {
        return [Core.getErrorMessage(error)];
    }

    try {
        Core.assertNonEmptyString(newName, {
            name: "newName",
            trim: true
        });
    } catch (error) {
        return [Core.getErrorMessage(error)];
    }

    try {
        assertValidIdentifierName(newName);
    } catch (error) {
        return [Core.getErrorMessage(error)];
    }

    // Extract symbol name from ID
    const symbolName = extractSymbolName(symbolId);

    if (symbolName === newName) {
        return [`The new name '${newName}' matches the existing identifier`];
    }

    if (hasMethod(resolver, "hasSymbol")) {
        const exists = await resolver.hasSymbol(symbolId);
        if (!exists) {
            return [`Symbol '${symbolId}' not found in semantic index`];
        }
    }

    return [];
}

/**
 * Internal sentinel value to represent global (unscoped) symbol occurrences.
 * Used to group occurrences without a scopeId for batch validation.
 */
const GLOBAL_SCOPE_KEY = "__global__";

/**
 * Batch validate scope safety for multiple occurrences efficiently.
 * Groups occurrences by scope to minimize redundant lookups, essential for
 * hot reload scenarios where many symbols need validation quickly.
 *
 * @param occurrences - Symbol occurrences to validate
 * @param newName - Proposed new name to check for conflicts
 * @param resolver - Symbol resolver for scope-aware checks
 * @returns Map of scope IDs to conflict information
 *
 * @example
 * const conflicts = await batchValidateScopeConflicts(
 *   occurrences,
 *   "newName",
 *   semantic
 * );
 * for (const [scopeId, conflict] of conflicts) {
 *   console.log(`Scope ${scopeId}: ${conflict.message}`);
 * }
 */
export async function batchValidateScopeConflicts(
    occurrences: Array<SymbolOccurrence>,
    newName: string,
    resolver: Partial<SymbolResolver> | null
): Promise<Map<string, { message: string; existingSymbol: string }>> {
    const conflicts = new Map<string, { message: string; existingSymbol: string }>();

    if (!resolver || typeof resolver.lookup !== "function" || occurrences.length === 0) {
        return conflicts;
    }

    let normalizedNewName: string;
    try {
        normalizedNewName = assertValidIdentifierName(newName);
    } catch {
        return conflicts;
    }

    const scopeGroups = new Map<string, Array<SymbolOccurrence>>();
    for (const occurrence of occurrences) {
        const scopeKey = occurrence.scopeId ?? GLOBAL_SCOPE_KEY;
        let group = scopeGroups.get(scopeKey);
        if (!group) {
            group = [];
            scopeGroups.set(scopeKey, group);
        }
        group.push(occurrence);
    }

    for (const [scopeId] of scopeGroups) {
        // eslint-disable-next-line no-await-in-loop -- Each scope must be validated sequentially for correctness
        const existing = await resolver.lookup(normalizedNewName, scopeId === GLOBAL_SCOPE_KEY ? undefined : scopeId);
        if (existing) {
            const scopeDisplayName = scopeId === GLOBAL_SCOPE_KEY ? "global scope" : `scope '${scopeId}'`;
            conflicts.set(scopeId, {
                message: `Name '${normalizedNewName}' already exists in ${scopeDisplayName}`,
                existingSymbol: existing.name
            });
        }
    }

    return conflicts;
}

/**
 * Validate that a rename maintains cross-file semantic consistency.
 * This function checks whether renaming a symbol would create ambiguous
 * references across different files in the project.
 *
 * For example, if file A defines and exports `foo`, and file B imports and
 * uses `foo`, renaming it to `bar` in file A must ensure that file B's
 * import is updated to `bar` as well. This validator detects cases where
 * the rename would leave file B with an unresolved reference.
 *
 * @param symbolId - The symbol being renamed
 * @param newName - The proposed new name
 * @param occurrences - All occurrences of the symbol
 * @param fileProvider - Provider for file-level symbol information
 * @returns Array of cross-file consistency errors
 *
 * @example
 * const errors = await validateCrossFileConsistency(
 *   "gml/script/scr_player",
 *   "scr_hero",
 *   occurrences,
 *   semantic
 * );
 * if (errors.length > 0) {
 *   console.error("Cross-file issues:", errors);
 * }
 */
export async function validateCrossFileConsistency(
    symbolId: string,
    newName: string,
    occurrences: Array<SymbolOccurrence>,
    fileProvider: Partial<FileSymbolProvider> | null
): Promise<Array<ConflictEntry>> {
    const errors: Array<ConflictEntry> = [];

    if (!fileProvider || !hasMethod(fileProvider, "getFileSymbols")) {
        return errors;
    }

    if (!symbolId || !newName || occurrences.length === 0) {
        return errors;
    }

    let normalizedNewName: string;
    try {
        normalizedNewName = assertValidIdentifierName(newName);
    } catch (error) {
        errors.push({
            type: ConflictType.INVALID_IDENTIFIER,
            message: Core.getErrorMessage(error)
        });
        return errors;
    }

    // Group occurrences by file to analyze file-level impact
    const fileOccurrences = new Map<string, Array<SymbolOccurrence>>();
    for (const occurrence of occurrences) {
        if (!occurrence.path) {
            continue;
        }
        let group = fileOccurrences.get(occurrence.path);
        if (!group) {
            group = [];
            fileOccurrences.set(occurrence.path, group);
        }
        group.push(occurrence);
    }

    // For each file with occurrences, check if there are other symbols that
    // might conflict with the new name after the rename
    for (const [filePath, fileOccs] of fileOccurrences) {
        // eslint-disable-next-line no-await-in-loop -- Each file must be checked sequentially
        const fileSymbols = await fileProvider.getFileSymbols(filePath);

        // Check if the file already defines a symbol with the new name
        const conflictingSymbol = fileSymbols.find((sym) => {
            const symName = extractSymbolName(sym.id);
            return symName === normalizedNewName && sym.id !== symbolId;
        });

        if (conflictingSymbol) {
            errors.push({
                type: ConflictType.SHADOW,
                message: `File '${filePath}' already defines symbol '${normalizedNewName}' (${conflictingSymbol.id})`,
                path: filePath
            });
        }

        // Warn if the file has many occurrences, as this increases the risk
        // of missing a reference during the rename operation
        if (fileOccs.length > 20) {
            errors.push({
                type: ConflictType.LARGE_RENAME,
                message: `File '${filePath}' contains ${fileOccs.length} occurrences - verify all references are updated`,
                severity: "warning",
                path: filePath
            });
        }
    }

    return errors;
}
