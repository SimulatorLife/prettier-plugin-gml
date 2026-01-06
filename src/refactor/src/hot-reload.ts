/**
 * Hot reload coordination for the refactor engine.
 * Handles dependency cascade computation, safety checks, patch generation,
 * and hot reload update preparation.
 */

import { WorkspaceEdit } from "./workspace-edit.js";
import {
    ConflictType,
    SymbolKind,
    parseSymbolKind,
    type CascadeEntry,
    type HotReloadCascadeResult,
    type HotReloadSafetySummary,
    type HotReloadUpdate,
    type PartialSemanticAnalyzer,
    type RenameRequest,
    type TranspilerBridge,
    type TranspilerPatch,
    type WorkspaceReadFile
} from "./types.js";
import { assertValidIdentifierName } from "./validation-utils.js";
import { detectRenameConflicts } from "./validation.js";
import * as SymbolQueries from "./symbol-queries.js";

/**
 * Prepare hot reload updates from a workspace edit.
 * Determines which symbols need recompilation and expands to transitive dependents.
 */
export async function prepareHotReloadUpdates(
    workspace: WorkspaceEdit,
    semantic: PartialSemanticAnalyzer | null
): Promise<Array<HotReloadUpdate>> {
    const updates: Array<HotReloadUpdate> = [];

    if (!workspace || workspace.edits.length === 0) {
        return updates;
    }

    // Group edits by file
    const grouped = workspace.groupByFile();
    const updatesBySymbol = new Map<string, HotReloadUpdate>();

    for (const [filePath, edits] of grouped.entries()) {
        // Determine which symbols are defined in this file
        let affectedSymbols = [];

        if (semantic && typeof semantic.getFileSymbols === "function") {
            affectedSymbols = await semantic.getFileSymbols(filePath);
        }

        // If we have specific symbol information, create targeted updates
        if (affectedSymbols.length > 0) {
            for (const symbol of affectedSymbols) {
                const update: HotReloadUpdate = {
                    symbolId: symbol.id,
                    action: "recompile",
                    filePath,
                    affectedRanges: edits.map((e) => ({
                        start: e.start,
                        end: e.end
                    }))
                };
                updates.push(update);
                updatesBySymbol.set(symbol.id, update);
            }
        } else {
            // Fallback: create a generic update for the file
            const update: HotReloadUpdate = {
                symbolId: `file://${filePath}`,
                action: "recompile",
                filePath,
                affectedRanges: edits.map((e) => ({
                    start: e.start,
                    end: e.end
                }))
            };
            updates.push(update);
            updatesBySymbol.set(update.symbolId, update);
        }
    }

    // Expand to transitive dependents using the cascade helper so hot reload
    // consumers receive a full picture of which symbols should be refreshed.
    const cascade = await computeHotReloadCascade(Array.from(updatesBySymbol.keys()), semantic);
    for (const entry of cascade.cascade) {
        if (updatesBySymbol.has(entry.symbolId)) {
            continue;
        }

        if (!entry.filePath) {
            continue;
        }

        const dependentUpdate: HotReloadUpdate = {
            symbolId: entry.symbolId,
            action: "notify",
            filePath: entry.filePath,
            affectedRanges: []
        };
        updates.push(dependentUpdate);
        updatesBySymbol.set(entry.symbolId, dependentUpdate);
    }

    return updates;
}

/**
 * Compute the full dependency cascade for hot reload operations.
 * Takes a set of changed symbols and computes all transitive dependents
 * that need to be reloaded, ordered for safe application.
 */
export async function computeHotReloadCascade(
    changedSymbolIds: Array<string>,
    semantic: PartialSemanticAnalyzer | null
): Promise<HotReloadCascadeResult> {
    if (!Array.isArray(changedSymbolIds)) {
        throw new TypeError("computeHotReloadCascade requires an array of symbol IDs");
    }

    if (changedSymbolIds.length === 0) {
        return {
            cascade: [],
            order: [],
            circular: [],
            metadata: {
                totalSymbols: 0,
                maxDistance: 0,
                hasCircular: false
            }
        };
    }

    // Track visited symbols to detect cycles and compute transitive closure
    const visited = new Set<string>();
    const visiting = new Set<string>(); // For cycle detection
    const cascade = new Map<string, CascadeEntry>(); // symbolId -> entry
    const circular: Array<Array<string>> = [];
    const dependencyGraph = new Map<string, Array<string>>();

    // Initialize changed symbols at distance 0
    for (const symbolId of changedSymbolIds) {
        cascade.set(symbolId, {
            symbolId,
            distance: 0,
            reason: "direct change"
        });
        visited.add(symbolId);
    }

    // Track the traversal path during DFS for complete cycle reconstruction.
    // This array is intentionally shared across all recursive calls to maintain
    // the full call stack, enabling accurate cycle path tracing when a back edge
    // is detected (e.g., A→B→C→A results in visitPath = [A, B, C] at the moment
    // we discover C depends on A).
    const visitPath: Array<string> = [];

    // Helper to reconstruct a complete cycle path from the current traversal state.
    // When we detect a symbol already in the visiting set, we know we've found a
    // back edge. This function extracts the cycle from visitPath by finding where
    // the cycle starts and appending the re-encountered symbol to close the loop.
    const reconstructCyclePath = (cycleStartSymbol: string): Array<string> => {
        const cycleStartIndex = visitPath.indexOf(cycleStartSymbol);
        if (cycleStartIndex !== -1) {
            return [...visitPath.slice(cycleStartIndex), cycleStartSymbol];
        }
        // Fallback if symbol isn't in path (shouldn't happen, but be defensive)
        return [cycleStartSymbol];
    };

    // Helper to explore dependencies recursively
    const exploreDependents = async (
        symbolId: string,
        currentDistance: number,
        parentReason: string
    ): Promise<{ cycleDetected: boolean; cycle?: Array<string> }> => {
        // Check if we're already exploring this symbol (cycle detection)
        if (visiting.has(symbolId)) {
            // Found a cycle - reconstruct the full cycle path from visitPath.
            // The cycle starts at the first occurrence of symbolId in visitPath
            // and extends to the current position where we re-encountered it.
            const cyclePath = reconstructCyclePath(symbolId);
            return { cycleDetected: true, cycle: cyclePath };
        }

        visiting.add(symbolId);
        visitPath.push(symbolId);

        try {
            // Query semantic analyzer for symbols that depend on this one
            if (semantic && typeof semantic.getDependents === "function") {
                const dependents = (await semantic.getDependents([symbolId])) ?? [];

                for (const dep of dependents) {
                    const depId = dep.symbolId;

                    // Track the dependency edge for topological sort
                    if (!dependencyGraph.has(symbolId)) {
                        dependencyGraph.set(symbolId, []);
                    }
                    dependencyGraph.get(symbolId).push(depId);

                    // Check if this creates a cycle by looking at the visiting set.
                    // The visiting set contains symbols currently on the call stack,
                    // so finding a dependent in that set means we've encountered a cycle.
                    if (visiting.has(depId)) {
                        // Reconstruct and record the complete cycle path
                        const cyclePath = reconstructCyclePath(depId);
                        circular.push(cyclePath);
                        continue;
                    }

                    // If we haven't visited this dependent yet, explore it
                    if (!visited.has(depId)) {
                        const newDistance = currentDistance + 1;
                        const reason = `depends on ${symbolId.split("/").pop()} (${parentReason})`;

                        cascade.set(depId, {
                            symbolId: depId,
                            distance: newDistance,
                            reason,
                            filePath: dep.filePath
                        });
                        visited.add(depId);

                        // Recursively explore this dependent's dependents
                        const result = await exploreDependents(depId, newDistance, reason);
                        if (result && result.cycleDetected && result.cycle) {
                            circular.push(result.cycle);
                        }
                    }
                }
            }
        } finally {
            visiting.delete(symbolId);
            visitPath.pop();
        }

        return { cycleDetected: false };
    };

    // Explore from each changed symbol
    for (const symbolId of changedSymbolIds) {
        await exploreDependents(symbolId, 0, "initial change");
    }

    // Convert cascade to array and compute topological order
    const cascadeArray = Array.from(cascade.values());

    // Topological sort using Kahn's algorithm
    // Build in-degree map
    const inDegree = new Map();
    for (const item of cascadeArray) {
        inDegree.set(item.symbolId, 0);
    }

    for (const [, toList] of dependencyGraph.entries()) {
        for (const to of toList) {
            if (inDegree.has(to)) {
                inDegree.set(to, inDegree.get(to) + 1);
            }
        }
    }

    // Process symbols with no incoming edges first (leaves of dependency tree)
    const queue: Array<string> = [];
    for (const [symbolId, degree] of inDegree.entries()) {
        if (degree === 0) {
            queue.push(symbolId);
        }
    }

    const order: Array<string> = [];
    while (queue.length > 0) {
        const current = queue.shift();
        order.push(current);

        // Reduce in-degree for dependents
        const dependents = dependencyGraph.get(current) || [];
        for (const dep of dependents) {
            if (inDegree.has(dep)) {
                const newDegree = inDegree.get(dep) - 1;
                inDegree.set(dep, newDegree);
                if (newDegree === 0) {
                    queue.push(dep);
                }
            }
        }
    }

    // If order doesn't include all symbols, we have cycles
    const hasUnorderedSymbols = order.length < cascadeArray.length;

    // Add any remaining symbols (those in cycles) to the end of the order
    for (const item of cascadeArray) {
        if (!order.includes(item.symbolId)) {
            order.push(item.symbolId);
        }
    }

    // Compute metadata
    const maxDistance = cascadeArray.reduce((max, item) => Math.max(max, item.distance), 0);

    return {
        cascade: cascadeArray,
        order,
        circular,
        metadata: {
            totalSymbols: cascadeArray.length,
            maxDistance,
            hasCircular: circular.length > 0 || hasUnorderedSymbols
        }
    };
}

/**
 * Check whether a rename operation is safe for hot reload.
 * This method performs a comprehensive analysis of whether a rename can be
 * applied without requiring a full game restart, taking into account symbol
 * types, scope changes, and runtime implications.
 */
export async function checkHotReloadSafety(
    request: RenameRequest,
    semantic: PartialSemanticAnalyzer | null
): Promise<HotReloadSafetySummary> {
    const { symbolId, newName } = request ?? {};
    const suggestions: Array<string> = [];

    if (!symbolId || !newName) {
        return {
            safe: false,
            reason: "Invalid rename request: missing symbolId or newName",
            requiresRestart: true,
            canAutoFix: false,
            suggestions
        };
    }

    // Validate identifier format first
    try {
        assertValidIdentifierName(newName);
    } catch (error) {
        return {
            safe: false,
            reason: `Invalid identifier name: ${error.message}`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions
        };
    }

    // Hot reload safety analysis relies on semantic knowledge to confirm the
    // symbol exists and to reason about scope conflicts. When the semantic
    // analyzer is unavailable, return a guarded failure instead of throwing so
    // callers receive actionable feedback they can surface to users.
    if (!semantic) {
        return {
            safe: false,
            reason: "Hot reload safety checks require a semantic analyzer to verify the rename",
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Run the semantic analysis pass before requesting hot reload safety",
                "Provide a semantic analyzer implementation when constructing RefactorEngine"
            ]
        };
    }

    // Check if symbol exists
    const exists = await SymbolQueries.validateSymbolExists(symbolId, semantic);
    if (!exists) {
        return {
            safe: false,
            reason: `Symbol '${symbolId}' not found in semantic index`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Ensure the project has been analyzed before attempting renames",
                "Verify the symbolId is correct"
            ]
        };
    }

    // Extract symbol metadata from the ID
    // SymbolId format: gml/{kind}/{name}, e.g., "gml/script/scr_player"
    const symbolParts = symbolId.split("/");
    if (symbolParts.length < 3) {
        return {
            safe: false,
            reason: `Malformed symbolId '${symbolId}'`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                "Ensure symbolId follows the pattern: gml/{kind}/{name}",
                "Example: gml/script/scr_player, gml/var/hp, gml/event/create"
            ]
        };
    }

    const rawSymbolKind = symbolParts[1];
    const symbolKind = parseSymbolKind(rawSymbolKind);
    const symbolName = symbolParts.at(-1);

    // Validate symbol kind
    if (symbolKind === null) {
        const validKinds = Object.values(SymbolKind).join(", ");
        return {
            safe: false,
            reason: `Invalid symbol kind '${rawSymbolKind}' in symbolId`,
            requiresRestart: true,
            canAutoFix: false,
            suggestions: [
                `Valid symbol kinds are: ${validKinds}`,
                "Ensure symbolId follows the pattern: gml/{kind}/{name}"
            ]
        };
    }

    // Check for name conflict
    if (symbolName === newName) {
        return {
            safe: false,
            reason: "New name matches the existing identifier",
            requiresRestart: false,
            canAutoFix: false,
            suggestions: ["Choose a different name"]
        };
    }

    // Gather occurrences to analyze scope and usage patterns
    const occurrences = await SymbolQueries.gatherSymbolOccurrences(symbolName, semantic);

    // Detect potential conflicts
    const conflicts = await detectRenameConflicts(symbolName, newName, occurrences, semantic, semantic);

    if (conflicts.length > 0) {
        const hasReservedConflict = conflicts.some((c) => c.type === ConflictType.RESERVED);
        const hasShadowConflict = conflicts.some((c) => c.type === ConflictType.SHADOW);

        if (hasReservedConflict) {
            return {
                safe: false,
                reason: "Cannot rename to a reserved keyword",
                requiresRestart: true,
                canAutoFix: false,
                suggestions: ["Choose a different name that isn't a reserved keyword"]
            };
        }

        if (hasShadowConflict) {
            return {
                safe: false,
                reason: "Rename would introduce shadowing conflicts",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "The refactor engine can automatically qualify identifiers to avoid shadowing",
                    "Consider using a less common name to avoid conflicts"
                ]
            };
        }

        return {
            safe: false,
            reason: `Rename has ${conflicts.length} conflict(s)`,
            requiresRestart: false,
            canAutoFix: false,
            suggestions: conflicts.map((c) => c.message)
        };
    }

    // Analyze hot reload implications based on symbol kind
    switch (symbolKind) {
        case SymbolKind.SCRIPT: {
            // Script renames are generally safe for hot reload as long as
            // we update all call sites simultaneously
            return {
                safe: true,
                reason: "Script renames are hot-reload-safe",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "All script call sites will be updated atomically",
                    "The hot reload system will recompile dependent scripts"
                ]
            };
        }

        case SymbolKind.VAR: {
            // Instance and global variable renames are safe if we update
            // all references, but need careful handling of self/other context
            if (symbolId.includes("::")) {
                // Instance variable (e.g., gml/var/obj_enemy::hp)
                return {
                    safe: true,
                    reason: "Instance variable renames are hot-reload-safe",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "All references will be updated with proper scope qualification",
                        "Existing instances will retain their current values"
                    ]
                };
            } else {
                // Global variable
                return {
                    safe: true,
                    reason: "Global variable renames are hot-reload-safe",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: ["Global state will be preserved during hot reload"]
                };
            }
        }

        case SymbolKind.EVENT: {
            // Event renames require special handling but are generally safe
            return {
                safe: true,
                reason: "Event renames are hot-reload-safe with reinit",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "Event dispatch will be updated to use the new name",
                    "Existing instances will have their event handlers updated"
                ]
            };
        }

        case SymbolKind.MACRO:
        case SymbolKind.ENUM: {
            // Macros and enums are compile-time constructs, so renaming them
            // requires recompiling all dependent code
            return {
                safe: false,
                reason: "Macro/enum renames require dependent script recompilation",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: [
                    "The hot reload system will automatically recompile all dependent scripts",
                    "Consider using the batch rename API to update multiple related symbols"
                ]
            };
        }

        default: {
            // Exhaustiveness check - TypeScript ensures all cases are handled
            const _exhaustive: never = symbolKind;
            return _exhaustive;
        }
    }
}

/**
 * Integrate refactor results with the transpiler for hot reload.
 * Takes hot reload updates and generates transpiled patches.
 */
export async function generateTranspilerPatches(
    hotReloadUpdates: Array<HotReloadUpdate>,
    readFile: WorkspaceReadFile,
    formatter: TranspilerBridge | null
): Promise<Array<TranspilerPatch>> {
    if (!Array.isArray(hotReloadUpdates)) {
        throw new TypeError("generateTranspilerPatches requires an array of hot reload updates");
    }

    if (!readFile || typeof readFile !== "function") {
        throw new TypeError("generateTranspilerPatches requires a readFile function");
    }

    const patches: Array<TranspilerPatch> = [];

    for (const update of hotReloadUpdates) {
        // Filter to recompile actions since only script recompilations produce
        // runtime patches that can be hot-reloaded. Asset renames and other
        // non-code changes don't require transpilation or runtime updates.
        if (update.action !== "recompile") {
            continue;
        }

        try {
            const sourceText = await readFile(update.filePath);

            // Transpile the updated script into a hot-reload patch if a transpiler
            // is available. The patch contains executable JavaScript code that the
            // GameMaker runtime can inject without restarting the game.
            if (formatter && typeof formatter.transpileScript === "function") {
                const patch = await formatter.transpileScript({
                    sourceText,
                    symbolId: update.symbolId
                });

                patches.push({
                    symbolId: update.symbolId,
                    patch,
                    filePath: update.filePath
                });
            } else {
                // Fall back to a basic patch structure containing only the source
                // text when transpilation isn't available. This still allows the
                // caller to process the updated files, though it won't be directly
                // executable by GameMaker's runtime without manual intervention.
                patches.push({
                    symbolId: update.symbolId,
                    patch: {
                        kind: "script",
                        id: update.symbolId,
                        sourceText,
                        version: Date.now()
                    },
                    filePath: update.filePath
                });
            }
        } catch (error) {
            // Log error but continue processing other updates
            if (typeof console !== "undefined" && console.warn) {
                console.warn(`Failed to generate patch for ${update.symbolId}: ${error.message}`);
            }
        }
    }

    return patches;
}
