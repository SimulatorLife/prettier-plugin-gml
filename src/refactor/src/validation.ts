/**
 * Validation module for refactoring operations.
 * Handles conflict detection, circular rename detection, and batch rename validation.
 * Also provides focused helpers for the batch rename validation orchestrator.
 */

import { Core } from "@gml-modules/core";

import {
    type ConflictEntry,
    ConflictType,
    type FileSymbolProvider,
    type KeywordProvider,
    type RenameRequest,
    type SymbolOccurrence,
    type SymbolResolver
} from "./types.js";
import {
    assertValidIdentifierName,
    DEFAULT_RESERVED_KEYWORDS,
    extractSymbolName,
    parseSymbolIdParts,
    tryNormalizeIdentifierName
} from "./validation-utils.js";

/**
 * Internal sentinel value to represent global (unscoped) symbol occurrences.
 * Used to group occurrences without a scopeId for batch validation.
 */
const GLOBAL_SCOPE_KEY = "__global__";

/**
 * Groups symbol occurrences by a derived key.
 * @param occurrences - Source occurrences to group
 * @param keySelector - Produces a stable grouping key for each occurrence
 * @returns Map of keys to grouped occurrences
 */
function groupOccurrencesByKey(
    occurrences: Array<SymbolOccurrence>,
    keySelector: (occurrence: SymbolOccurrence) => string | null
): Map<string, Array<SymbolOccurrence>> {
    const groups = new Map<string, Array<SymbolOccurrence>>();

    for (const occurrence of occurrences) {
        const key = keySelector(occurrence);
        if (!key) {
            continue;
        }

        const existingGroup = groups.get(key);
        if (existingGroup) {
            existingGroup.push(occurrence);
            continue;
        }

        groups.set(key, [occurrence]);
    }

    return groups;
}

/**
 * Groups occurrences by scope and collects file paths for each scope.
 * @param occurrences - Symbol occurrences to group
 * @returns Map of scope keys to sets of file paths
 */
function groupOccurrencesByScope(occurrences: Array<SymbolOccurrence>): Map<string, Set<string>> {
    const groupedByScope = groupOccurrencesByKey(occurrences, (occurrence) => occurrence.scopeId ?? GLOBAL_SCOPE_KEY);

    const scopeToPaths = new Map<string, Set<string>>();

    for (const [scopeKey, groupedOccurrences] of groupedByScope) {
        const paths = new Set<string>();
        for (const occurrence of groupedOccurrences) {
            if (occurrence.path) {
                paths.add(occurrence.path);
            }
        }

        scopeToPaths.set(scopeKey, paths);
    }

    return scopeToPaths;
}

/**
 * Adds shadow conflict entries for a given scope and its paths.
 * @param conflicts - Array to append conflicts to
 * @param oldName - Original symbol name
 * @param newName - New symbol name
 * @param paths - File paths in the affected scope
 */
function addShadowConflicts(
    conflicts: Array<ConflictEntry>,
    oldName: string,
    newName: string,
    paths: Set<string>
): void {
    const message = `Renaming '${oldName}' to '${newName}' would shadow existing symbol in scope`;

    if (paths.size === 0) {
        conflicts.push({
            type: ConflictType.SHADOW,
            message
        });
        return;
    }

    for (const path of paths) {
        conflicts.push({
            type: ConflictType.SHADOW,
            message,
            path
        });
    }
}

/**
 * Checks for shadowing conflicts across all scopes.
 * @param oldName - Original symbol name
 * @param normalizedNewName - Normalized new symbol name
 * @param occurrences - All symbol occurrences
 * @param resolver - Symbol resolver for scope-aware lookups
 * @returns Array of shadow conflicts found
 */
async function checkShadowingConflicts(
    oldName: string,
    normalizedNewName: string,
    occurrences: Array<SymbolOccurrence>,
    resolver: Partial<SymbolResolver>
): Promise<Array<ConflictEntry>> {
    const conflicts: Array<ConflictEntry> = [];
    const scopeToPaths = groupOccurrencesByScope(occurrences);
    const scopeEntries = [...scopeToPaths.entries()];
    const lookupResults = await Promise.all(
        scopeEntries.map(async ([scopeKey, paths]) => {
            const existing = await resolver.lookup(
                normalizedNewName,
                scopeKey === GLOBAL_SCOPE_KEY ? undefined : scopeKey
            );
            return { existing, paths };
        })
    );

    for (const { existing, paths } of lookupResults) {
        // Guard clause: skip if no conflict exists
        if (!existing || existing.name === oldName) {
            continue;
        }

        addShadowConflicts(conflicts, oldName, normalizedNewName, paths);
    }

    return conflicts;
}

/**
 * Builds the complete set of reserved keywords by combining defaults with semantic keywords.
 * @param keywordProvider - Provider for semantic reserved keywords (null if not available)
 * @returns Set of all reserved keywords (lowercase)
 */
async function buildReservedKeywordSet(
    keywordProvider: Partial<KeywordProvider> | null
): Promise<ReadonlySet<string> | Set<string>> {
    if (!Core.hasMethods(keywordProvider, "getReservedKeywords")) {
        return DEFAULT_RESERVED_KEYWORDS;
    }

    const semanticReserved = (await keywordProvider.getReservedKeywords()) ?? [];
    return new Set([...DEFAULT_RESERVED_KEYWORDS, ...semanticReserved.map((keyword) => keyword.toLowerCase())]);
}

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

    // Check for shadowing conflicts if resolver supports scope-aware lookups
    if (Core.hasMethods(resolver, "lookup")) {
        const shadowConflicts = await checkShadowingConflicts(oldName, normalizedNewName, occurrences, resolver);
        conflicts.push(...shadowConflicts);
    }

    // Check if new name conflicts with reserved keywords
    const reservedKeywords = await buildReservedKeywordSet(keywordProvider);
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
        const parsed = parseSymbolIdParts(rename.symbolId);
        const pathParts = parsed ? [...parsed.segments] : rename.symbolId.split("/");
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

    if (Core.hasMethods(resolver, "hasSymbol")) {
        const exists = await resolver.hasSymbol(symbolId);
        if (!exists) {
            return [`Symbol '${symbolId}' not found in semantic index`];
        }
    }

    return [];
}

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

    const normalizedNewName = tryNormalizeIdentifierName(newName);
    if (!normalizedNewName) {
        // Return early if the new name is syntactically invalid (e.g., reserved
        // keyword, contains illegal characters). There's no point checking for
        // conflicts when the rename target itself is malformed—validation will
        // fail at the assertion stage anyway. Returning the empty conflicts array
        // here keeps the caller's error reporting focused on the primary validation
        // failure rather than cascading into false-positive conflict detection.
        return conflicts;
    }

    const scopeGroups = groupOccurrencesByKey(occurrences, (occurrence) => occurrence.scopeId ?? GLOBAL_SCOPE_KEY);
    const scopeIds = [...scopeGroups.keys()];
    const lookupResults = await Promise.all(
        scopeIds.map(async (scopeId) => ({
            scopeId,
            existing: await resolver.lookup(normalizedNewName, scopeId === GLOBAL_SCOPE_KEY ? undefined : scopeId)
        }))
    );

    for (const { scopeId, existing } of lookupResults) {
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

    if (!fileProvider || !Core.hasMethods(fileProvider, "getFileSymbols")) {
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
    const fileOccurrences = groupOccurrencesByKey(occurrences, (occurrence) => occurrence.path ?? null);
    const fileEntries = [...fileOccurrences.entries()];
    const fileSymbolResults = await Promise.all(
        fileEntries.map(async ([filePath, fileOccs]) => ({
            filePath,
            fileOccs,
            fileSymbols: await fileProvider.getFileSymbols(filePath)
        }))
    );

    // For each file with occurrences, check if there are other symbols that
    // might conflict with the new name after the rename
    for (const { filePath, fileOccs, fileSymbols } of fileSymbolResults) {
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

// ---------------------------------------------------------------------------
// Batch rename validation helpers
// ---------------------------------------------------------------------------
// These focused helpers are extracted from the validateBatchRenameRequest
// orchestrator so each concern lives at a single abstraction layer and can be
// tested independently.
// ---------------------------------------------------------------------------

/**
 * Detects duplicate symbolId entries in a batch of rename requests.
 * When the same symbol appears more than once the intent is ambiguous and
 * the generated edits would conflict with each other.
 *
 * @param renames - Batch of rename requests to inspect
 * @returns Errors and conflictingSets arrays for duplicate symbolId entries
 *
 * @example
 * const { errors, conflictingSets } = detectDuplicateSymbolIdRenames([
 *   { symbolId: "gml/script/scr_a", newName: "scr_x" },
 *   { symbolId: "gml/script/scr_a", newName: "scr_y" }
 * ]);
 * // errors → ["Duplicate rename request for symbolId 'gml/script/scr_a' (2 entries)"]
 */
export function detectDuplicateSymbolIdRenames(renames: Array<RenameRequest>): {
    errors: Array<string>;
    conflictingSets: Array<Array<string>>;
} {
    const symbolIdCounts = new Map<string, number>();
    for (const rename of renames) {
        if (rename && typeof rename === "object" && typeof rename.symbolId === "string") {
            const count = (symbolIdCounts.get(rename.symbolId) ?? 0) + 1;
            symbolIdCounts.set(rename.symbolId, count);
        }
    }

    const errors: Array<string> = [];
    const conflictingSets: Array<Array<string>> = [];
    for (const [symbolId, count] of symbolIdCounts.entries()) {
        if (count > 1) {
            errors.push(`Duplicate rename request for symbolId '${symbolId}' (${count} entries)`);
            conflictingSets.push(Array.from({ length: count }, () => symbolId));
        }
    }

    return { errors, conflictingSets };
}

/**
 * Detects rename requests that share the same normalized target name.
 * Renaming multiple distinct symbols to the same new name creates ambiguous
 * references and would leave the symbol table in a corrupt state.
 *
 * Entries that are structurally malformed (missing fields, non-string values)
 * or that carry an invalid identifier name are silently skipped here; their
 * errors are already surfaced in the per-rename validation pass.
 *
 * @param renames - Batch of rename requests to inspect
 * @returns Errors and conflictingSets arrays for duplicate target name entries
 *
 * @example
 * const { errors, conflictingSets } = detectDuplicateTargetNameRenames([
 *   { symbolId: "gml/script/scr_a", newName: "scr_x" },
 *   { symbolId: "gml/script/scr_b", newName: "scr_x" }
 * ]);
 * // errors → ["Multiple symbols cannot be renamed to 'scr_x': gml/script/scr_a, gml/script/scr_b"]
 */
export function detectDuplicateTargetNameRenames(renames: Array<RenameRequest>): {
    errors: Array<string>;
    conflictingSets: Array<Array<string>>;
} {
    const newNameToSymbols = new Map<string, Array<string>>();
    for (const rename of renames) {
        if (
            !rename ||
            typeof rename !== "object" ||
            !rename.newName ||
            typeof rename.newName !== "string" ||
            !rename.symbolId ||
            typeof rename.symbolId !== "string"
        ) {
            // Skip structural validation failures that were already flagged in the
            // per-rename validation pass. Continuing here prevents the duplicate-name
            // detection logic from crashing on malformed entries.
            continue;
        }

        const normalizedNewName = tryNormalizeIdentifierName(rename.newName);
        if (!normalizedNewName) {
            // Skip invalid identifier names (e.g., reserved keywords, names with
            // illegal characters) because they will be reported by the per-rename
            // validation pass. Continuing here lets the batch validator collect
            // duplicate-name conflicts for the valid subset.
            continue;
        }

        const existingGroup = newNameToSymbols.get(normalizedNewName);
        if (existingGroup) {
            existingGroup.push(rename.symbolId);
        } else {
            newNameToSymbols.set(normalizedNewName, [rename.symbolId]);
        }
    }

    const errors: Array<string> = [];
    const conflictingSets: Array<Array<string>> = [];
    for (const [newName, symbolIds] of newNameToSymbols.entries()) {
        if (symbolIds.length > 1) {
            errors.push(`Multiple symbols cannot be renamed to '${newName}': ${symbolIds.join(", ")}`);
            conflictingSets.push(symbolIds);
        }
    }

    return { errors, conflictingSets };
}

/**
 * Filters a batch of rename requests to only those with structurally valid
 * `symbolId` and `newName` string fields.
 *
 * Malformed entries are silently excluded because their structural errors are
 * already reported in the per-rename validation pass. This helper exists so the
 * batch orchestrator does not repeat the same guard clauses in every subsequent
 * validation phase.
 *
 * @param renames - Batch of rename requests to filter
 * @returns Array containing only the structurally valid rename requests
 *
 * @example
 * const valid = filterStructurallyValidRenames([
 *   { symbolId: "gml/script/scr_a", newName: "scr_x" },
 *   null,
 *   { symbolId: 42, newName: "scr_y" }
 * ]);
 * // valid → [{ symbolId: "gml/script/scr_a", newName: "scr_x" }]
 */
export function filterStructurallyValidRenames(renames: Array<RenameRequest>): Array<RenameRequest> {
    return renames.filter(
        (rename) =>
            rename &&
            typeof rename === "object" &&
            rename.symbolId &&
            typeof rename.symbolId === "string" &&
            rename.newName &&
            typeof rename.newName === "string"
    );
}

/**
 * Warns when a rename's target name matches another symbol's original name in
 * the same batch, creating potential confusion about which symbol is being
 * referenced after the edits are applied.
 *
 * For example, renaming `foo→bar` in a batch that also renames `bar→baz` is
 * suspicious because call sites that previously referenced `bar` would silently
 * start calling the symbol that was formerly named `foo`.
 *
 * Only entries whose `symbolId` and `newName` fields can be successfully
 * normalized are considered; malformed entries are skipped.
 *
 * @param renames - Structurally valid rename requests to check
 * @returns Warning messages for each detected name-confusion pair
 *
 * @example
 * const warnings = detectCrossRenameNameConfusion([
 *   { symbolId: "gml/script/foo", newName: "bar" },
 *   { symbolId: "gml/script/bar", newName: "baz" }
 * ]);
 * // warnings → ["Rename introduces potential confusion: 'gml/script/foo' renamed to 'bar' which was an original symbol name in this batch"]
 */
export function detectCrossRenameNameConfusion(renames: Array<RenameRequest>): Array<string> {
    // First pass: collect all original symbol names in this batch
    const oldNames = new Set<string>();
    for (const rename of renames) {
        const oldName = extractSymbolName(rename.symbolId);
        if (oldName) {
            oldNames.add(oldName);
        }
    }

    // Second pass: warn when a target name shadows an existing name in the batch
    const warnings: Array<string> = [];
    for (const rename of renames) {
        const oldName = extractSymbolName(rename.symbolId);
        if (!oldName) {
            continue;
        }

        const normalizedNewName = tryNormalizeIdentifierName(rename.newName);
        if (!normalizedNewName) {
            // Skip invalid identifier names during the confusion-detection pass.
            // Errors for these names will be surfaced in the main validation
            // results, so continuing here prevents duplicate error reporting.
            continue;
        }

        // Warn if this new name matches any old name in the batch (potential confusion)
        // but exclude the case where it's the same symbol (already caught as same-name rename)
        if (oldNames.has(normalizedNewName) && oldName !== normalizedNewName) {
            warnings.push(
                `Rename introduces potential confusion: '${rename.symbolId}' renamed to '${normalizedNewName}' which was an original symbol name in this batch`
            );
        }
    }

    return warnings;
}
